import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { candidatesIn, HEADER, MEMBERS_HEADER, placementIn } from '../src/background/sheets'
import { enhancePage } from '../src/page/enhance'
import type { Consideration } from '../src/shared/consideration'
import { MEMBERS, ORGANIZATIONS, SEED_SHEET } from './data'
import { organizationsHtml } from './page'
import { demoConsiderations, demoSheetCsv } from './sheet'

/** Just enough CSV parsing for the demo files: quoted cells may hold commas, quotes and newlines */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i)
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      }
      else if (c === '"') quoted = false
      else cell += c
    }
    else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    }
    else if (c === '\n') {
      rows.push([...row, cell])
      row = []
      cell = ''
    }
    else if (c !== '\r') cell += c
  }
  return rows
}

describe('demo sheet', () => {
  it('has every calling on the mock page, where the extension would put it', () => {
    document.body.innerHTML = organizationsHtml(ORGANIZATIONS)
    const { rows, cleanup } = enhancePage(document)
    const place = ({ key, calling, member, organization, position }: Omit<Consideration, 'candidates'>) => ({ key, calling, member, organization, position })
    const onPage = rows().map(place)
    cleanup()

    assert.deepEqual(demoConsiderations().map(place), onPage)
  })

  it('reads back as the seeded sheet and members', () => {
    const files = demoSheetCsv()
    const [header, ...rows] = parseCsv(files['Considering.csv'] ?? '')
    assert.deepEqual(header, HEADER)
    const read = new Map(rows.map(row => [row[0], candidatesIn(row)]))
    for (const [key, candidates] of Object.entries(SEED_SHEET)) assert.deepEqual(read.get(key), candidates)
    assert.deepEqual(rows.map(placementIn), demoConsiderations().map(({ organization, position }) => ({ organization, position })))

    const [membersHeader, ...members] = parseCsv(files['Members.csv'] ?? '')
    assert.deepEqual(membersHeader, MEMBERS_HEADER)
    assert.deepEqual(members, MEMBERS.map(m => [m.uuid, m.name]))
  })

  it('is what demo/sheet/ holds', async () => {
    for (const [name, content] of Object.entries(demoSheetCsv())) {
      assert.equal(await readFile(`demo/sheet/${name}`, 'utf8'), content, `run npm run demo:sheet to update demo/sheet/${name}`)
    }
  })
})
