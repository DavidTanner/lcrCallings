import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { fakeApi, MEMBERS, orgTable } from '../test/fixtures'
import { App } from './App'
import { LAYER_ID } from './constants'
import { SLOT } from './page/enhance'
import { SAVE_DELAY_MS } from './Tracker'

const SHEET_ID = '1AbC-dEf_ghIJklMNopQRstuVWxyz0123456789'

/** What's rendered into a calling's cell, inside its shadow root */
const cell = (calling: string) => [...document.querySelectorAll(`[${SLOT}]`)]
  .find(slot => slot.getAttribute(SLOT)?.startsWith(`${calling}|`))?.shadowRoot?.lastElementChild as HTMLElement | null | undefined
const input = (calling: string) => cell(calling)?.querySelector<HTMLInputElement>(`input[aria-label="Considering for ${calling}"]`)
const notes = (calling: string, name: string) => cell(calling)?.querySelector<HTMLTextAreaElement>(`textarea[aria-label="Notes on ${name} for ${calling}"]`)
const picked = (calling: string) => [...cell(calling)?.querySelectorAll('.mantine-Pill-label') ?? []].map(pill => pill.textContent)
async function pick(calling: string, name: string) {
  const field = input(calling)
  const container = cell(calling)
  assert.ok(field && container)
  fireEvent.click(field)
  fireEvent.change(field, { target: { value: name.slice(0, 3) } })
  // the test env renders dropdowns in place rather than in the layer
  const option = await within(container).findByRole('option', { name })
  await act(async () => {
    fireEvent.click(option)
    await Promise.resolve()
  })
}

const renderApp = (api: ReturnType<typeof fakeApi>, onClose = () => undefined) => render(
  <MantineProvider env="test">
    <App doc={document} api={api} onClose={onClose} />
  </MantineProvider>,
)

describe('App', () => {
  beforeEach(() => {
    document.body.innerHTML = orgTable('Bishopric', [
      { calling: 'Bishop', person: 'p1' },
      { calling: 'Ward Clerk' },
    ])
  })

  afterEach(cleanup)

  it('asks for a sheet the first time, then adds the column', async () => {
    const api = fakeApi()
    renderApp(api)
    const field = await screen.findByLabelText(/Google Sheet/)

    fireEvent.change(field, { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    assert.ok(screen.getByText('Paste the link to a Google Sheet'))

    fireEvent.change(field, { target: { value: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit` } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    assert.ok(await screen.findByText(/Tracking 2 callings/))
    assert.equal(await api.getSpreadsheetId(), SHEET_ID)
    assert.ok(input('Ward Clerk'))
  })

  it('reconnects to the saved sheet and shows its candidates and notes', async () => {
    renderApp(fakeApi({ spreadsheetId: SHEET_ID, sheet: { 'Ward Clerk|vacant|0': [{ id: 'm1', notes: 'Good with numbers' }] } }))
    await screen.findByText(/Tracking 2 callings/)
    assert.deepEqual(picked('Ward Clerk'), ['Abel, Bea'])
    assert.equal(notes('Ward Clerk', 'Abel, Bea')?.value, 'Good with numbers')
    assert.deepEqual(picked('Bishop'), [])
    assert.equal(screen.getByRole('link', { name: 'the shared sheet' }).getAttribute('href'), `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`)
  })

  it('shows candidates who are not in the member list', async () => {
    renderApp(fakeApi({ spreadsheetId: SHEET_ID, sheet: { 'Ward Clerk|vacant|0': [{ id: 'text:Brother Jones', notes: '' }, { id: 'moved-out', notes: '' }] } }))
    await screen.findByText(/Tracking/)
    assert.deepEqual(picked('Ward Clerk'), ['Brother Jones', 'moved-out'])
  })

  it('tells apart members with the same name', async () => {
    const members = [...MEMBERS, { uuid: 'm4', name: 'Abel, Bea', nameSort: 'ABEL, BEA' }]
    const api = fakeApi({ spreadsheetId: SHEET_ID, members, sheet: { 'Bishop|p1|0': [{ id: 'm4', notes: 'The younger one' }] } })
    renderApp(api)
    await screen.findByText(/Tracking/)
    assert.equal(notes('Bishop', 'Abel, Bea')?.value, 'The younger one')

    const field = input('Ward Clerk')
    const container = cell('Ward Clerk')
    assert.ok(field && container)
    fireEvent.click(field)
    fireEvent.change(field, { target: { value: 'Abe' } })
    const options = await within(container).findAllByRole('option', { name: 'Abel, Bea' })
    assert.equal(options.length, 2)
    await act(async () => {
      fireEvent.click(options[1] as HTMLElement)
      await Promise.resolve()
    })
    assert.deepEqual(api.saved.at(-1), { key: 'Ward Clerk|vacant|0', calling: 'Ward Clerk', member: '', candidates: [{ id: 'm4', notes: '' }] })
  })

  it('saves candidates picked from the member list', async () => {
    const api = fakeApi({ spreadsheetId: SHEET_ID })
    renderApp(api)
    await screen.findByText(/Tracking/)
    await pick('Bishop', 'Baker, Cal')
    assert.deepEqual(api.saved, [{ key: 'Bishop|p1|0', calling: 'Bishop', member: 'p1', candidates: [{ id: 'm2', notes: '' }] }])
    assert.deepEqual(picked('Bishop'), ['Baker, Cal'])
    assert.ok(notes('Bishop', 'Baker, Cal'))
    assert.ok(screen.getByText('All changes saved'))
  })

  it('saves notes once typing pauses, or when leaving the field', async () => {
    const api = fakeApi({ spreadsheetId: SHEET_ID, sheet: { 'Bishop|p1|0': [{ id: 'm1', notes: '' }] } })
    renderApp(api)
    await screen.findByText(/Tracking/)
    mock.timers.enable({ apis: ['setTimeout'] })
    try {
      const field = notes('Bishop', 'Abel, Bea')
      assert.ok(field)
      fireEvent.change(field, { target: { value: 'Ask' } })
      fireEvent.change(field, { target: { value: 'Ask in May' } })
      assert.equal(api.saved.length, 0)
      await act(async () => {
        mock.timers.tick(SAVE_DELAY_MS)
        await Promise.resolve()
      })
      assert.deepEqual(api.saved.map(c => c.candidates), [[{ id: 'm1', notes: 'Ask in May' }]])

      await act(async () => {
        fireEvent.change(field, { target: { value: 'Ask in June' } })
        fireEvent.blur(field)
        await Promise.resolve()
      })
      assert.deepEqual(api.saved.at(-1)?.candidates, [{ id: 'm1', notes: 'Ask in June' }])
      mock.timers.tick(SAVE_DELAY_MS)
      assert.equal(api.saved.length, 2)
    }
    finally {
      mock.timers.reset()
    }
  })

  it('reports save failures', async () => {
    const api = fakeApi({ spreadsheetId: SHEET_ID })
    renderApp(api)
    await screen.findByText(/Tracking/)
    api.failWith = 'The caller does not have permission'
    await pick('Bishop', 'Abel, Bea')
    assert.ok(await screen.findByText('Not saved: The caller does not have permission'))
  })

  it('reports when the member list cannot be loaded', async () => {
    const api = fakeApi({ spreadsheetId: SHEET_ID })
    api.membersFailWith = 'Couldn\'t get the member list from LCR'
    renderApp(api)
    assert.ok(await screen.findByText('Couldn\'t get the member list from LCR'))
  })

  it('refreshes with changes others made', async () => {
    const api = fakeApi({ spreadsheetId: SHEET_ID })
    renderApp(api)
    await screen.findByText(/Tracking/)
    api.sheet['Bishop|p1|0'] = [{ id: 'm3', notes: 'From someone else' }]
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
      await Promise.resolve()
    })
    assert.deepEqual(picked('Bishop'), ['Cole, Dee'])
    assert.equal(notes('Bishop', 'Cole, Dee')?.value, 'From someone else')
  })

  it('lets the user retry when the sheet cannot be opened', async () => {
    const api = fakeApi({ spreadsheetId: SHEET_ID })
    api.failWith = 'Requested entity was not found.'
    renderApp(api)
    assert.ok(await screen.findByText('Requested entity was not found.'))
    assert.equal(input('Bishop'), undefined)

    delete api.failWith
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    assert.ok(await screen.findByText(/Tracking 2 callings/))
  })

  it('removes the column when closed', async () => {
    const onClose = mock.fn()
    const { unmount } = renderApp(fakeApi({ spreadsheetId: SHEET_ID }), onClose)
    await screen.findByText(/Tracking/)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    assert.equal(onClose.mock.callCount(), 1)
    unmount()
    assert.equal(input('Bishop'), undefined)
    assert.equal(document.getElementById(LAYER_ID), null)
  })
})
