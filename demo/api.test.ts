import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { enhancePage } from '../src/page/enhance'
import { demoApi, DEMO_SPREADSHEET_ID, memoryStorage, resetDemo } from './api'
import { MEMBERS, ORGANIZATIONS, SEED_SHEET } from './data'
import { organizationsHtml } from './page'

describe('demo', () => {
  it('starts connected to the seeded sheet', async () => {
    const api = demoApi({ delayMs: 0 })
    assert.equal(await api.getSpreadsheetId(), DEMO_SPREADSHEET_ID)
    assert.deepEqual(await api.load(DEMO_SPREADSHEET_ID), SEED_SHEET)
    assert.deepEqual(await api.loadMembers(), MEMBERS)
  })

  it('keeps saves in storage until reset', async () => {
    const storage = memoryStorage()
    const consideration = { key: 'Organist|vacant|0', calling: 'Organist', member: '', candidates: [{ id: 'x', notes: 'hi' }] }
    await demoApi({ storage, delayMs: 0 }).save(DEMO_SPREADSHEET_ID, consideration)

    const reopened = demoApi({ storage, delayMs: 0 })
    assert.deepEqual((await reopened.load(DEMO_SPREADSHEET_ID))['Organist|vacant|0'], consideration.candidates)

    resetDemo(storage)
    assert.deepEqual(await reopened.load(DEMO_SPREADSHEET_ID), SEED_SHEET)
  })

  it('syncs callings not in the sheet yet', async () => {
    const storage = memoryStorage()
    const [seeded = ''] = Object.keys(SEED_SHEET)
    const considerations = [
      { key: seeded, calling: 'Seeded', member: '', candidates: [] },
      { key: 'Sunbeam Teacher|vacant|0', calling: 'Sunbeam Teacher', member: '', candidates: [] },
    ]
    const api = demoApi({ storage, delayMs: 0 })
    assert.equal(await api.sync(DEMO_SPREADSHEET_ID, considerations), 1)
    const sheet = await api.load(DEMO_SPREADSHEET_ID)
    assert.deepEqual(sheet[seeded], SEED_SHEET[seeded])
    assert.deepEqual(sheet['Sunbeam Teacher|vacant|0'], [])
    assert.equal(await api.sync(DEMO_SPREADSHEET_ID, considerations), 0)
  })

  it('seeds only rows that are on the mock page', () => {
    document.body.innerHTML = organizationsHtml(ORGANIZATIONS)
    const { rows, cleanup } = enhancePage(document)
    const keys = new Set(rows().map(row => row.key))
    cleanup()

    const names = new Set(MEMBERS.map(m => m.uuid))
    for (const [key, candidates] of Object.entries(SEED_SHEET)) {
      assert.ok(keys.has(key), `${key} is on the page`)
      for (const c of candidates) assert.ok(names.has(c.id), `${c.id} is a member`)
    }
  })
})
