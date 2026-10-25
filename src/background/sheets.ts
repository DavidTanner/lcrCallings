import { type Candidate, type Consideration, type HolderStatus, isHolderStatus, isStatus, type Tracking, tracking } from '../shared/consideration'

/** Title of the tab the extension keeps its rows in */
export const SHEET_TITLE = 'Considering'
/**
 * Members are recorded by their LCR member uuid, never by name, since members
 * can share a name. Considering, Notes and Status are for people reading the
 * sheet; the extension reads candidates back from Data. Rows saved before Data
 * existed only have Considering, as free text. Organization and Position say
 * where the calling is on the Organizations page, so it can be shown the same
 * way away from it. Holder status is where whoever holds the calling now is,
 * e.g. being considered for release.
 */
export const HEADER = ['Key', 'Calling', 'Held by', 'Considering', 'Updated', 'Notes', 'Data', 'Status', 'Organization', 'Position', 'Holder status']
const LAST_COLUMN = 'K'
/** Organization and Position */
const PLACEMENT_COLUMNS = ['I', 'J'] as const

/** Between the headings in the Organization column */
export const ORGANIZATION_SEPARATOR = ' > '

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
 * The app only has access (the drive.file scope) to sheets someone chose for
 * it in Google's file picker, so Google answers 403 or 404 for any other,
 * just as it does for one that isn't shared with them
 */
export const needsAccess = (error: unknown) => error instanceof SheetsError && (error.status === 403 || error.status === 404)

/** `save` refused, since the row changed since it was loaded */
export const isConflict = (error: unknown) => error instanceof SheetsError && error.status === 409

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
  const row = (consideration: Consideration, updated: string) => {
    const { key, calling, member, candidates, holderStatus } = consideration
    return [
      key,
      calling,
      member,
      candidates.map(c => c.id).join('\n'),
      updated,
      candidates.filter(c => c.notes).map(c => `${c.id}: ${c.notes}`).join('\n'),
      candidates.length ? JSON.stringify(candidates) : '',
      candidates.filter(c => c.status).map(c => `${c.id}: ${c.status ?? ''}`).join('\n'),
      ...placement(consideration),
      holderStatus ?? '',
    ]
  }
  const append = (id: string, considerations: Consideration[], updated = new Date().toISOString()) =>
    request(`${range(id, `A:${LAST_COLUMN}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: considerations.map(c => row(c, updated)) }),
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

  /** Every row, in sheet order. A repeated key's row is the one `rowsByKey` picks, in the place of the first. */
  async function loadRows(id: string): Promise<Consideration[]> {
    await ensureSheet(id)
    const { values = [] } = await request<{ values?: string[][] }>(range(id, `A2:${LAST_COLUMN}`))
    return [...rowsByKey(values).values()].map((index) => {
      const row = values[index] ?? []
      const [key = '', calling = '', member = ''] = row
      return { key, calling, member, ...placementIn(row), ...trackingIn(row) }
    })
  }

  return {
    /** key → who is being considered, and where the holder is. A repeated key's row is the one `rowsByKey` picks. */
    async load(id: string): Promise<Record<string, Tracking>> {
      const rows = await loadRows(id)
      return Object.fromEntries(rows.map(row => [row.key, tracking(row)]))
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

    /**
     * Updates the row for this key (the one `rowsByKey` picks), or appends one. Refuses to update a row
     * whose Updated isn't `consideration.updated`, the one it had when loaded,
     * so edits others made since aren't overwritten. Returns the Updated written.
     */
    async save(id: string, consideration: Consideration): Promise<string> {
      await ensureSheet(id)
      // look the row up fresh each time: others may have added rows since
      const { values = [] } = await request<{ values?: string[][] }>(range(id, 'A:E'))
      const index = rowsByKey(values, 1).get(consideration.key) ?? -1
      const updated = new Date().toISOString()
      if (index > 0) {
        // shortcut: hand edits in the sheet don't change Updated, so they aren't detected; compare the whole row if that matters
        if ((values[index]?.[4] ?? '') !== (consideration.updated ?? '')) {
          throw new SheetsError(409, 'Someone else changed this calling since you loaded it. Press Refresh, then make your change again.')
        }
        const body = JSON.stringify({ values: [row(consideration, updated)] })
        await request(`${range(id, `A${String(index + 1)}:${LAST_COLUMN}${String(index + 1)}`)}?valueInputOption=RAW`, { method: 'PUT', body })
      }
      else {
        await append(id, [consideration], updated)
      }
      return updated
    },

    /**
     * Appends a row, in one request, for each consideration whose key isn't in
     * the sheet yet. Of rows already there, only Organization and Position are
     * brought up to date, so edits others made aren't overwritten. Returns how
     * many rows were added. They have no Updated, so a row someone else
     * appended for the same key meanwhile, which has one, is the one used.
     */
    async sync(id: string, considerations: Consideration[]): Promise<number> {
      await ensureSheet(id)
      const { values = [] } = await request<{ values?: string[][] }>(range(id, `A:${LAST_COLUMN}`))
      /** where each key's row is, as in `save` */
      const existing = rowsByKey(values, 1)

      const missing: Consideration[] = []
      const moved: { range: string, values: (string | number)[][] }[] = []
      for (const c of considerations) {
        const index = existing.get(c.key)
        if (index === undefined) {
          missing.push(c)
          continue
        }
        const [, , , , , , , , organization = '', position = ''] = values[index] ?? []
        const cells = placement(c)
        if (c.organization && cells.map(String).join('\t') !== [organization, position].join('\t')) {
          const n = String(index + 1)
          moved.push({ range: `'${SHEET_TITLE}'!${PLACEMENT_COLUMNS[0]}${n}:${PLACEMENT_COLUMNS[1]}${n}`, values: [cells] })
        }
      }
      if (moved.length) {
        await request(`${encodeURIComponent(id)}/values:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({ valueInputOption: 'RAW', data: moved }),
        })
      }
      if (missing.length) await append(id, missing, '')
      return missing.length
    },
  }
}

/**
 * Where each key's row is in `values`, from index `from` on, in the order keys
 * first appear. Where a key repeats, the row with the newest Updated (blank is
 * oldest), so an empty row `sync` added can't hide one saved meanwhile; on a
 * tie, the last.
 */
function rowsByKey(values: string[][], from = 0) {
  const rows = new Map<string, number>()
  values.forEach(([key = '', , , , updated = ''], index) => {
    const kept = rows.get(key)
    // ISO timestamps sort as text
    if (index >= from && key && (kept === undefined || updated >= (values[kept]?.[4] ?? ''))) rows.set(key, index)
  })
  return rows
}

/** The Organization and Position cells for a row */
function placement({ organization, position }: Pick<Consideration, 'organization' | 'position'>): (string | number)[] {
  return [organization?.join(ORGANIZATION_SEPARATOR) ?? '', position ?? '']
}

/** Where a row says its calling is on the Organizations page, leaving out what it doesn't say */
export function placementIn([, , , , , , , , organization = '', position = '']: string[]): Pick<Consideration, 'organization' | 'position'> {
  const headings = organization.split(ORGANIZATION_SEPARATOR).map(h => h.trim()).filter(Boolean)
  const at = position.trim() ? Number(position) : NaN
  return {
    ...(headings.length ? { organization: headings } : {}),
    ...(Number.isInteger(at) && at >= 0 ? { position: at } : {}),
  }
}

/** Who is being considered in a row, where the holder is, and when it was saved */
export function trackingIn(row: string[]): Tracking {
  const holderStatus = holderStatusIn(row)
  const [, , , , updated] = row
  return { candidates: candidatesIn(row), ...(holderStatus ? { holderStatus } : {}), ...(updated ? { updated } : {}) }
}

/** The Holder status cell, unless it's empty or edited by hand into something unknown */
function holderStatusIn([, , , , , , , , , , status = '']: string[]): HolderStatus | undefined {
  const value = status.trim()
  return isHolderStatus(value) ? value : undefined
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
