import { type Candidate, type Consideration, isStatus } from '../shared/consideration'

/** Title of the tab the extension keeps its rows in */
export const SHEET_TITLE = 'Considering'
/**
 * Members are recorded by their LCR member uuid, never by name, since members
 * can share a name. Considering, Notes and Status are for people reading the
 * sheet; the extension reads candidates back from Data. Rows saved before Data
 * existed only have Considering, as free text.
 */
export const HEADER = ['Key', 'Calling', 'Held by', 'Considering', 'Updated', 'Notes', 'Data', 'Status']
const LAST_COLUMN = 'H'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'

export interface TokenProvider {
  get: () => Promise<string>
  /** called when Google rejects a token, before asking for a fresh one */
  invalidate: (token: string) => Promise<void>
}

export class SheetsError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/**
 * Reads and writes considerations in a shared spreadsheet, one row per
 * calling row on the page, keyed by column A.
 */
export function createSheetsClient(tokens: TokenProvider, fetchFn: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const token = await tokens.get()
    const response = await fetchFn(`${API}/${path}`, {
      ...init,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (response.status === 401 && retry) {
      await tokens.invalidate(token)
      return request(path, init, false)
    }
    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined
      throw new SheetsError(response.status, body?.error?.message ?? `Google Sheets request failed (${String(response.status)})`)
    }
    return await response.json() as T
  }

  const range = (id: string, a1: string) => `${encodeURIComponent(id)}/values/${encodeURIComponent(`'${SHEET_TITLE}'!${a1}`)}`
  const row = ({ key, calling, member, candidates }: Consideration) => [
    key,
    calling,
    member,
    candidates.map(c => c.id).join('\n'),
    new Date().toISOString(),
    candidates.filter(c => c.notes).map(c => `${c.id}: ${c.notes}`).join('\n'),
    candidates.length ? JSON.stringify(candidates) : '',
    candidates.filter(c => c.status).map(c => `${c.id}: ${c.status ?? ''}`).join('\n'),
  ]
  const writeHeader = (id: string) =>
    request(`${range(id, 'A1')}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [HEADER] }) })

  /** Adds the tab if the spreadsheet doesn't have it yet, and brings its header up to date */
  async function prepare(id: string) {
    const { sheets = [] } = await request<{ sheets?: { properties: { title: string } }[] }>(
      `${encodeURIComponent(id)}?fields=sheets.properties.title`,
    )
    if (!sheets.some(s => s.properties.title === SHEET_TITLE)) {
      await request(`${encodeURIComponent(id)}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_TITLE, gridProperties: { frozenRowCount: 1 } } } }] }),
      })
      await writeHeader(id)
      return
    }
    const { values: [header = []] = [] } = await request<{ values?: string[][] }>(range(id, `A1:${LAST_COLUMN}1`))
    if (header.join('\t') !== HEADER.join('\t')) await writeHeader(id)
  }

  // once per spreadsheet for as long as the service worker lives
  const prepared = new Map<string, Promise<void>>()
  function ensureSheet(id: string) {
    let ready = prepared.get(id)
    if (!ready) {
      ready = prepare(id)
      prepared.set(id, ready)
      ready.catch(() => prepared.delete(id))
    }
    return ready
  }

  async function keys(id: string) {
    const { values = [] } = await request<{ values?: string[][] }>(range(id, 'A:A'))
    return values.map(([key]) => key)
  }

  return {
    /** key → who is being considered. Later rows win if a key is repeated. */
    async load(id: string): Promise<Record<string, Candidate[]>> {
      await ensureSheet(id)
      const { values = [] } = await request<{ values?: string[][] }>(range(id, `A2:${LAST_COLUMN}`))
      return Object.fromEntries(values.filter(([key]) => key).map(values => [values[0] ?? '', candidatesIn(values)]))
    },

    /** Updates the row for this key, or appends one */
    async save(id: string, consideration: Consideration): Promise<void> {
      await ensureSheet(id)
      // look the row up fresh each time: others may have added rows since
      const index = (await keys(id)).lastIndexOf(consideration.key)
      const values = JSON.stringify({ values: [row(consideration)] })
      if (index > 0) {
        await request(`${range(id, `A${String(index + 1)}:${LAST_COLUMN}${String(index + 1)}`)}?valueInputOption=RAW`, { method: 'PUT', body: values })
      }
      else {
        await request(`${range(id, `A:${LAST_COLUMN}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: values })
      }
    },
  }
}

/** Looks like an LCR member uuid */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The candidates in a row: from Data, or else Considering, as member uuids one
 * per line, or free text from before candidates were picked from the member list
 */
export function candidatesIn([, , , considering = '', , , data = '']: string[]): Candidate[] {
  if (data) {
    try {
      const parsed: unknown = JSON.parse(data)
      if (Array.isArray(parsed)) return parsed.flatMap(toCandidate)
    }
    catch { /* someone edited it by hand; fall back to Considering */ }
  }
  const text = considering.trim()
  if (!text) return []
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.every(line => UUID.test(line))) return lines.map(id => ({ id, notes: '' }))
  return [{ id: `text:${text}`, notes: '' }]
}

/** Rows saved before names were dropped also have a name in Data, which is ignored */
function toCandidate(value: unknown): Candidate[] {
  if (typeof value !== 'object' || value === null) return []
  const { id, notes, status } = value as Partial<Record<keyof Candidate, unknown>>
  if (typeof id !== 'string') return []
  return [{ id, notes: typeof notes === 'string' ? notes : '', ...(isStatus(status) ? { status } : {}) }]
}

export type SheetsClient = ReturnType<typeof createSheetsClient>
