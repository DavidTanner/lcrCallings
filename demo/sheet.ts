import { HEADER, MEMBERS_HEADER, MEMBERS_TITLE, ORGANIZATION_SEPARATOR, SHEET_TITLE } from '../src/background/sheets'
import type { Consideration } from '../src/shared/consideration'
import { MEMBERS, ORGANIZATIONS, rowKey, SEED_SHEET } from './data'

// The demo ward as CSV files, one per tab, to import into a Google Sheet so
// the web page (and the extension) can be tried against a real sheet
// without real member data. `npm run demo:sheet` writes them to demo/sheet/.

/** Stands in for when the rows were saved, so the files only change when the data does */
export const DEMO_UPDATED = '2025-01-01T00:00:00.000Z'

/** Every calling on the mock Organizations page, as the extension sees it after Sync all callings */
export function demoConsiderations(): Consideration[] {
  const seen = new Map<string, number>()
  const considerations: Consideration[] = []
  for (const { name, tables } of ORGANIZATIONS) {
    for (const { heading, callings } of tables) {
      // an organization with a single table is headed by its name alone (see demo/page.ts)
      const organization = tables.length === 1 ? [name] : [name, heading]
      for (const { calling, holder } of callings) {
        const id = `${calling}|${holder ?? 'vacant'}`
        const occurrence = seen.get(id) ?? 0
        seen.set(id, occurrence + 1)
        const key = rowKey(calling, holder, occurrence)
        considerations.push({
          key,
          calling,
          member: holder ?? '',
          organization,
          position: considerations.length,
          ...SEED_SHEET[key] ?? { candidates: [] },
        })
      }
    }
  }
  return considerations
}

/** A row of the Considering tab, as the extension writes it (see src/background/sheets.ts) */
function sheetRow({ key, calling, member, organization = [], position, candidates, holderStatus }: Consideration): string[] {
  return [
    key,
    calling,
    member,
    candidates.map(c => c.id).join('\n'),
    DEMO_UPDATED,
    candidates.filter(c => c.notes).map(c => `${c.id}: ${c.notes}`).join('\n'),
    candidates.length ? JSON.stringify(candidates) : '',
    candidates.filter(c => c.status).map(c => `${c.id}: ${c.status ?? ''}`).join('\n'),
    organization.join(ORGANIZATION_SEPARATOR),
    position === undefined ? '' : String(position),
    holderStatus ?? '',
  ]
}

const csvCell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
const csv = (rows: string[][]) => rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n'

/**
 * The demo sheet's tabs as CSV, by file name. Google Sheets names a tab
 * imported from a file after it, so each file is named for its tab.
 */
export function demoSheetCsv(): Record<string, string> {
  return {
    [`${SHEET_TITLE}.csv`]: csv([HEADER, ...demoConsiderations().map(sheetRow)]),
    [`${MEMBERS_TITLE}.csv`]: csv([MEMBERS_HEADER, ...MEMBERS.map(m => [m.uuid, m.name])]),
  }
}
