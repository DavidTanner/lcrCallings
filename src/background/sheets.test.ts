import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { candidatesIn, createSheetsClient, HEADER, MEMBERS_TITLE, SHEET_TITLE, type TokenProvider } from './sheets'

const ID = 'sheet1'
const RANGE = encodeURIComponent(`'${SHEET_TITLE}'!`)
const MEMBERS_RANGE = encodeURIComponent(`'${MEMBERS_TITLE}'!`)

interface Call { method: string, url: string, body?: unknown }

/** A fetch that answers from a pretend spreadsheet and records every call */
function fakeGoogle({ tabs = [SHEET_TITLE], rows = [HEADER] as string[][], members = [] as string[][], status }: { tabs?: string[], rows?: string[][], members?: string[][], status?: number[] } = {}) {
  const calls: Call[] = []
  const fetchFn = (input: string, init: RequestInit = {}) => {
    const url = input.replace('https://sheets.googleapis.com/v4/spreadsheets/', '')
    const method = init.method ?? 'GET'
    calls.push({ method, url, ...(typeof init.body === 'string' ? { body: JSON.parse(init.body) as unknown } : {}) })
    const reply = (body: unknown, code = 200) => Promise.resolve(new Response(JSON.stringify(body), { status: code }))
    const forced = status?.shift()
    if (forced) return reply({ error: { message: `status ${String(forced)}` } }, forced)
    if (url.endsWith('?fields=sheets.properties.title')) return reply({ sheets: tabs.map(title => ({ properties: { title } })) })
    if (url.includes(`${RANGE}A%3AA`)) return reply({ values: rows.map(([key = '']) => [key]) })
    if (url.includes(`${RANGE}A1%3AH1`)) return reply({ values: rows.slice(0, 1) })
    if (url.includes(`${RANGE}A2%3AH`)) return reply({ values: rows.slice(1) })
    if (url.endsWith(`${MEMBERS_RANGE}A2%3AB`)) return reply({ values: members })
    return reply({})
  }
  return { calls, fetchFn: fetchFn }
}

const tokens = (): TokenProvider & { invalidated: string[] } => {
  let n = 0
  const invalidated: string[] = []
  return { invalidated, get: () => Promise.resolve(`token${String(++n)}`), invalidate: (t) => {
    invalidated.push(t)
    return Promise.resolve()
  } }
}

const consideration = {
  key: 'Bishop|p1|0',
  calling: 'Bishop',
  member: 'p1',
  candidates: [
    { id: 'm1', notes: 'Available after June' },
    { id: 'm2', notes: '', status: 'Pray about' as const },
  ],
}

describe('createSheetsClient', () => {
  it('loads candidates by key', async () => {
    const data = JSON.stringify(consideration.candidates)
    const google = fakeGoogle({ rows: [HEADER, ['a', 'Bishop', '', 'X', '', '', data], ['b', 'Clerk'], ['c', 'Clerk', '', 'Y'], ['a', 'Bishop', '', 'Z', '', '', '[]']] })
    const values = await createSheetsClient(tokens(), google.fetchFn).load(ID)
    assert.deepEqual(values, { a: [], b: [], c: [{ id: 'text:Y', notes: '' }] })
  })

  it('reads candidates from Data, or else the member ids or free text in Considering', () => {
    const data = JSON.stringify(consideration.candidates)
    const uuids = ['f0488c41-072f-4e4f-9b61-4d915df4d31b', '04d270ec-5e5b-4f3b-b414-5c12a11cd1a1']
    assert.deepEqual(candidatesIn(['k', 'Bishop', '', 'ignored', '', '', data]), consideration.candidates)
    assert.deepEqual(candidatesIn(['k', 'Bishop', '', ` ${uuids.join('\n')}\n`]), uuids.map(id => ({ id, notes: '' })))
    assert.deepEqual(candidatesIn(['k', 'Bishop', '', ' Brother Jones ']), [{ id: 'text:Brother Jones', notes: '' }])
    assert.deepEqual(candidatesIn(['k', 'Bishop', '', 'Typed', '', '', 'not json']), [{ id: 'text:Typed', notes: '' }])
  })

  it('ignores names in Data saved before they were dropped', () => {
    assert.deepEqual(candidatesIn(['k', 'Bishop', '', '', '', '', '[{"id":"m1","name":"A","notes":"N"},{"id":2}]']), [{ id: 'm1', notes: 'N' }])
  })

  it('ignores statuses in Data that are not on the list', () => {
    const data = '[{"id":"m1","notes":"","status":"Sustained"},{"id":"m2","notes":"","status":"Maybe"}]'
    assert.deepEqual(candidatesIn(['k', 'Bishop', '', '', '', '', data]), [{ id: 'm1', notes: '', status: 'Sustained' }, { id: 'm2', notes: '' }])
  })

  it('updates an old header', async () => {
    const google = fakeGoogle({ rows: [HEADER.slice(0, 5)] })
    await createSheetsClient(tokens(), google.fetchFn).load(ID)
    const write = google.calls.find(c => c.method === 'PUT')
    assert.deepEqual(write?.body, { values: [HEADER] })
  })

  it('checks the tab once per spreadsheet', async () => {
    const google = fakeGoogle()
    const client = createSheetsClient(tokens(), google.fetchFn)
    await client.load(ID)
    await client.load(ID)
    assert.equal(google.calls.filter(c => c.url.endsWith('?fields=sheets.properties.title')).length, 1)
    assert.equal(google.calls.filter(c => c.method === 'PUT').length, 0)
  })

  it('creates the tab with a header row when it is missing', async () => {
    const google = fakeGoogle({ tabs: ['Sheet1'] })
    await createSheetsClient(tokens(), google.fetchFn).load(ID)
    const [, addSheet, header] = google.calls
    assert.deepEqual(addSheet?.body, { requests: [{ addSheet: { properties: { title: SHEET_TITLE, gridProperties: { frozenRowCount: 1 } } } }] })
    assert.equal(header?.method, 'PUT')
    assert.deepEqual(header.body, { values: [HEADER] })
  })

  it('updates the existing row for a key', async () => {
    const google = fakeGoogle({ rows: [HEADER, ['other'], [consideration.key]] })
    await createSheetsClient(tokens(), google.fetchFn).save(ID, consideration)
    const write = google.calls.at(-1)
    assert.equal(write?.method, 'PUT')
    assert.match(write.url, new RegExp(`^${ID}/values/${RANGE}A3%3AH3\\?valueInputOption=RAW$`))
    const [key, calling, member, considering, , notes, data, status] = (write.body as { values: string[][] }).values[0] ?? []
    assert.deepEqual([key, calling, member, considering, notes, status], ['Bishop|p1|0', 'Bishop', 'p1', 'm1\nm2', 'm1: Available after June', 'm2: Pray about'])
    assert.deepEqual(JSON.parse(data ?? ''), consideration.candidates)
  })

  it('appends a row for a new key', async () => {
    const google = fakeGoogle()
    await createSheetsClient(tokens(), google.fetchFn).save(ID, consideration)
    const write = google.calls.at(-1)
    assert.equal(write?.method, 'POST')
    assert.match(write.url, /A%3AH:append\?valueInputOption=RAW&insertDataOption=INSERT_ROWS$/)
  })

  it('appends rows for keys not in the sheet yet in one request', async () => {
    const google = fakeGoogle({ rows: [HEADER, [consideration.key]] })
    const vacant = { key: 'Ward Clerk|vacant|0', calling: 'Ward Clerk', member: '', candidates: [] }
    const added = await createSheetsClient(tokens(), google.fetchFn).sync(ID, [consideration, vacant])
    assert.equal(added, 1)
    const writes = google.calls.filter(c => c.method !== 'GET')
    assert.equal(writes.length, 1)
    assert.match(writes[0]?.url ?? '', /A%3AH:append\?valueInputOption=RAW&insertDataOption=INSERT_ROWS$/)
    const [[key, calling, member, considering, , notes, data, status] = []] = (writes[0]?.body as { values: string[][] }).values
    assert.deepEqual([key, calling, member, considering, notes, data, status], ['Ward Clerk|vacant|0', 'Ward Clerk', '', '', '', '', ''])
  })

  it('writes nothing when every key is already in the sheet', async () => {
    const google = fakeGoogle({ rows: [HEADER, [consideration.key]] })
    assert.equal(await createSheetsClient(tokens(), google.fetchFn).sync(ID, [consideration]), 0)
    assert.equal(google.calls.filter(c => c.method !== 'GET').length, 0)
  })

  it('retries once with a fresh token when Google rejects one', async () => {
    const t = tokens()
    const google = fakeGoogle({ status: [401] })
    await createSheetsClient(t, google.fetchFn).load(ID)
    assert.deepEqual(t.invalidated, ['token1'])
  })

  it('reports Google\'s error message', async () => {
    const google = fakeGoogle({ status: [403] })
    await assert.rejects(createSheetsClient(tokens(), google.fetchFn).load(ID), { message: 'status 403', status: 403 })
  })

  it('loads every row with its calling and holder, in sheet order', async () => {
    const data = JSON.stringify(consideration.candidates)
    const google = fakeGoogle({ rows: [HEADER, ['a', 'Bishop', 'p1', '', '', '', data], ['', 'Blank'], ['b', 'Clerk'], ['a', 'Bishop', 'p1', '', '', '', '[]']] })
    const rows = await createSheetsClient(tokens(), google.fetchFn).loadRows(ID)
    assert.deepEqual(rows, [
      { key: 'a', calling: 'Bishop', member: 'p1', candidates: [] },
      { key: 'b', calling: 'Clerk', member: '', candidates: [] },
    ])
  })

  it('loads members from the Members tab', async () => {
    const google = fakeGoogle({ tabs: [SHEET_TITLE, MEMBERS_TITLE], members: [['m1', 'Abel, Bea'], ['m2'], ['m3', 'Cole, Dee']] })
    const members = await createSheetsClient(tokens(), google.fetchFn).loadMembers(ID)
    assert.deepEqual(members, [{ uuid: 'm1', name: 'Abel, Bea' }, { uuid: 'm3', name: 'Cole, Dee' }])
  })

  it('loads no members when there is no Members tab yet', async () => {
    const google = fakeGoogle()
    assert.deepEqual(await createSheetsClient(tokens(), google.fetchFn).loadMembers(ID), [])
    assert.equal(google.calls.length, 1)
  })

  it('writes members over the old ones, then clears any left over', async () => {
    const google = fakeGoogle({ tabs: [SHEET_TITLE, MEMBERS_TITLE] })
    await createSheetsClient(tokens(), google.fetchFn).saveMembers(ID, [{ uuid: 'm1', name: 'Abel, Bea' }, { uuid: 'm2', name: 'Baker, Cal' }])
    const [write, clear] = google.calls.filter(c => c.method !== 'GET')
    assert.equal(write?.method, 'PUT')
    assert.match(write.url, new RegExp(`^${ID}/values/${MEMBERS_RANGE}A1%3AB3\\?valueInputOption=RAW$`))
    assert.deepEqual(write.body, { values: [['Id', 'Name'], ['m1', 'Abel, Bea'], ['m2', 'Baker, Cal']] })
    assert.match(clear?.url ?? '', new RegExp(`^${ID}/values/${MEMBERS_RANGE}A4%3AB:clear$`))
  })

  it('adds the Members tab when it is missing', async () => {
    const google = fakeGoogle()
    await createSheetsClient(tokens(), google.fetchFn).saveMembers(ID, [])
    const addSheet = google.calls.find(c => c.url.endsWith(':batchUpdate'))
    assert.deepEqual(addSheet?.body, { requests: [{ addSheet: { properties: { title: MEMBERS_TITLE, gridProperties: { frozenRowCount: 1 } } } }] })
  })
})
