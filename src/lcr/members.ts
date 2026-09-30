/**
 * Parses the React Server Components ("flight") payload LCR's Next.js pages
 * send, e.g. a saved `/mlt/orgs` response, and extracts the members in it.
 *
 * A payload is a series of rows, each `<hex id>:<tag?><value>`:
 * - JSON rows (no tag) end at a newline
 * - `T` rows are text, `T<hex byte length>,<text>`, and are *not*
 *   newline-terminated; the next row follows immediately
 * - other tags (`I` module imports, `HL` preload hints, ...) end at a newline
 */

export interface FlightRow {
  id: string
  /** '' for JSON rows */
  tag: string
  /** parsed JSON for JSON rows, the raw text for every other row */
  value: unknown
}

export function parseFlight(payload: string): FlightRow[] {
  // T row lengths are in UTF-8 bytes, so work on bytes
  const bytes = new TextEncoder().encode(payload)
  const decoder = new TextDecoder()
  const NEWLINE = 0x0a
  const COLON = 0x3a
  const COMMA = 0x2c
  const rows: FlightRow[] = []

  let pos = 0
  while (pos < bytes.length) {
    if (bytes[pos] === NEWLINE) {
      pos++
      continue
    }
    const colon = bytes.indexOf(COLON, pos)
    if (colon < 0) break
    const id = decoder.decode(bytes.subarray(pos, colon))
    pos = colon + 1

    let tagEnd = pos
    const isTagChar = (byte = 0) => byte >= 0x41 && byte <= 0x5a // A-Z
    while (isTagChar(bytes[tagEnd])) tagEnd++
    const tag = decoder.decode(bytes.subarray(pos, tagEnd))

    if (tag === 'T') {
      const comma = bytes.indexOf(COMMA, tagEnd)
      const length = parseInt(decoder.decode(bytes.subarray(tagEnd, comma)), 16)
      rows.push({ id, tag, value: decoder.decode(bytes.subarray(comma + 1, comma + 1 + length)) })
      pos = comma + 1 + length
      continue
    }

    let end = bytes.indexOf(NEWLINE, tagEnd)
    if (end < 0) end = bytes.length
    const text = decoder.decode(bytes.subarray(tagEnd, end))
    let value: unknown = text
    if (!tag) {
      try {
        value = JSON.parse(text)
      }
      catch { /* keep the raw text */ }
    }
    rows.push({ id, tag, value })
    pos = end + 1
  }
  return rows
}

export interface Member {
  uuid: string
  /** "Last, First" */
  name: string
  /** sortable form of the name */
  nameSort: string
  sex?: 'M' | 'F'
  currentUnitName?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** LCR's newer pages put names in `nameFormats` instead of `name` and `nameSort` */
function nameFormat(value: Record<string, unknown>, key: string): string | undefined {
  const formats = value.nameFormats
  if (!isRecord(formats)) return undefined
  const format = formats[key]
  return typeof format === 'string' ? format : undefined
}

const SEXES: Partial<Record<string, 'M' | 'F'>> = { M: 'M', F: 'F', MALE: 'M', FEMALE: 'F' }

/** `strict` also requires a sortable name, to tell members apart from other things with a uuid and name */
function toMember(value: unknown, strict: boolean): Member | undefined {
  if (!isRecord(value)) return undefined
  const { uuid, sex, currentUnitName } = value
  const name = typeof value.name === 'string' ? value.name : nameFormat(value, 'listPreferredLocal')
  const nameSort = typeof value.nameSort === 'string' ? value.nameSort : nameFormat(value, 'listPreferredSort')
  if (typeof uuid !== 'string' || name === undefined) return undefined
  if (strict && nameSort === undefined) return undefined
  const sexCode = typeof sex === 'string' ? SEXES[sex] : undefined
  return {
    uuid,
    name,
    nameSort: nameSort ?? name,
    ...(sexCode ? { sex: sexCode } : {}),
    ...(typeof currentUnitName === 'string' ? { currentUnitName } : {}),
  }
}

/**
 * The unique members in a flight payload, sorted by name. Members are the
 * `person` objects found anywhere in its JSON rows (on the Organizations page,
 * the people holding each calling), and anything else shaped like one (with a
 * uuid, name and nameSort, or `nameFormats` as the Member List page's
 * `members` have), so it keeps working if LCR moves them.
 */
export function parseMembers(payload: string): Member[] {
  const members = new Map<string, Member>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
    }
    else if (isRecord(value)) {
      const member = toMember(value, true)
      if (member) {
        members.set(member.uuid, member)
        return
      }
      for (const [key, child] of Object.entries(value)) {
        const person = key === 'person' ? toMember(child, false) : undefined
        if (person) members.set(person.uuid, person)
        else visit(child)
      }
    }
  }
  for (const row of parseFlight(payload)) if (!row.tag) visit(row.value)
  return [...members.values()].sort((a, b) => a.nameSort.localeCompare(b.nameSort))
}
