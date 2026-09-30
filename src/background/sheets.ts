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

/**
 * Title of the tab the extension copies the unit's members into, so pages
 * away from LCR, which can't read its member list, can show and pick names
 */
export const MEMBERS_TITLE = 'Members'
export const MEMBERS_HEADER = ['Id', 'Name']

/** Someone in the unit, as the Members tab keeps them */
export interface SheetMember {
  uuid: string
  name: string
}

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

  const range = (id: string, a1: string, tab = SHEET_TITLE) => `${encodeURIComponent(id)}/values/${encodeURIComponent(`'${tab}'!${a1}`)}`
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
  const append = (id: string, considerations: Consideration[]) =>
    request(`${range(id, `A:${LAST_COLUMN}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: considerations.map(row) }),
    })
  const writeHeader = (id: string) =>
    request(`${range(id, 'A1')}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [HEADER] }) })

  async function tabs(id: string) {
    const { sheets = [] } = await request<{ sheets?: { properties: { title: string } }[] }>(
      `${encodeURIComponent(id)}?fields=sheets.properties.title`,
    )
    return sheets.map(s => s.properties.title)
  }
  const addTab = (id: string, title: string) => request(`${encodeURIComponent(id)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] }),
  })

  /** Adds the tab if the spreadsheet doesn't have it yet, and brings its header up to date */
  async function prepare(id: string) {
    if (!(await tabs(id)).includes(SHEET_TITLE)) {
      await addTab(id, SHEET_TITLE)
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

  /** Every row, in sheet order. Later rows win if a key is repeated, in the place of the first. */
  async function loadRows(id: string): Promise<Consideration[]> {
    await ensureSheet(id)
    const { values = [] } = await request<{ values?: string[][] }>(range(id, `A2:${LAST_COLUMN}`))
    const rows = new Map<string, Consideration>()
    for (const row of values) {
      const [key = '', calling = '', member = ''] = row
      if (key) rows.set(key, { key, calling, member, candidates: candidatesIn(row) })
    }
    return [...rows.values()]
  }

  return {
    /** key → who is being considered. Later rows win if a key is repeated. */
    async load(id: string): Promise<Record<string, Candidate[]>> {
      const rows = await loadRows(id)
      return Object.fromEntries(rows.map(({ key, candidates }) => [key, candidates]))
    },

    loadRows,

    /** The members the extension copied into the Members tab; none if it hasn't yet */
    async loadMembers(id: string): Promise<SheetMember[]> {
      if (!(await tabs(id)).includes(MEMBERS_TITLE)) return []
      const { values = [] } = await request<{ values?: string[][] }>(range(id, 'A2:B', MEMBERS_TITLE))
      return values.flatMap(([uuid, name]) => uuid && name ? [{ uuid, name }] : [])
    },

    /**
     * Replaces the Members tab with `members`, adding it if needed. Rows are
     * written over the old ones before any left over are cleared, so someone
     * reading it meanwhile never sees it empty.
     */
    async saveMembers(id: string, members: SheetMember[]): Promise<void> {
      if (!(await tabs(id)).includes(MEMBERS_TITLE)) await addTab(id, MEMBERS_TITLE)
      const values = [MEMBERS_HEADER, ...members.map(m => [m.uuid, m.name])]
      await request(`${range(id, `A1:B${String(values.length)}`, MEMBERS_TITLE)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values }) })
      await request(`${range(id, `A${String(values.length + 1)}:B`, MEMBERS_TITLE)}:clear`, { method: 'POST', body: '{}' })
    },

    /** Updates the row for this key, or appends one */
    async save(id: string, consideration: Consideration): Promise<void> {
      await ensureSheet(id)
      // look the row up fresh each time: others may have added rows since
      const index = (await keys(id)).lastIndexOf(consideration.key)
      if (index > 0) {
        const values = JSON.stringify({ values: [row(consideration)] })
        await request(`${range(id, `A${String(index + 1)}:${LAST_COLUMN}${String(index + 1)}`)}?valueInputOption=RAW`, { method: 'PUT', body: values })
      }
      else {
        await append(id, [consideration])
      }
    },

    /**
     * Appends a row, in one request, for each consideration whose key isn't in
     * the sheet yet. Rows already there are left alone, so edits others made
     * aren't overwritten. Returns how many rows were added.
     */
    async sync(id: string, considerations: Consideration[]): Promise<number> {
      await ensureSheet(id)
      const existing = new Set(await keys(id))
      const missing = considerations.filter(c => !existing.has(c.key))
      if (missing.length) await append(id, missing)
      return missing.length
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
