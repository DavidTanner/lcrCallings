import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { SheetMember } from '../src/background/sheets'
import type { Consideration } from '../src/shared/consideration'
import { WebApp } from './App'
import type { WebApi } from './Board'
import { type GoogleAuth, SignInRequired } from './google'

const SHEET_ID = '1AbC-dEf_ghIJklMNopQRstuVWxyz0123456789'

const MEMBERS: SheetMember[] = [
  { uuid: 'm1', name: 'Abel, Bea' },
  { uuid: 'm2', name: 'Baker, Cal' },
  { uuid: 'p1', name: 'Pratt, Orson' },
]

const ROWS: Consideration[] = [
  { key: 'Bishop|p1|0', calling: 'Bishop', member: 'p1', candidates: [] },
  { key: 'Ward Clerk|vacant|0', calling: 'Ward Clerk', member: '', candidates: [{ id: 'm1', notes: 'Good with numbers', status: 'Pray about' }] },
]

/** Google sign-in that works whenever asked, signed in or not to start with */
function fakeAuth(signedIn: boolean) {
  const auth: GoogleAuth & { signedIn: boolean, signIns: number } = {
    signedIn,
    signIns: 0,
    tokens: {
      get: () => auth.signedIn ? Promise.resolve('token') : Promise.reject(new SignInRequired()),
      invalidate: () => Promise.resolve(),
    },
    isSignedIn: () => auth.signedIn,
    signIn: () => {
      auth.signIns++
      auth.signedIn = true
      return Promise.resolve()
    },
    signOut: () => {
      auth.signedIn = false
    },
  }
  return auth
}

/** A pretend sheet that needs `auth` to be signed in */
function fakeApi(auth: GoogleAuth, rows = ROWS, members = MEMBERS) {
  const saved: Consideration[] = []
  const signedIn = () => auth.isSignedIn() ? Promise.resolve() : Promise.reject(new SignInRequired())
  const api: WebApi & { saved: Consideration[] } = {
    saved,
    loadRows: async () => {
      await signedIn()
      return structuredClone(rows)
    },
    loadMembers: async () => {
      await signedIn()
      return members
    },
    save: async (_id, consideration) => {
      await signedIn()
      saved.push(consideration)
    },
  }
  return api
}

interface RenderOptions {
  spreadsheetId?: string
  onSpreadsheetId?: (id: string | undefined) => void
}

const renderApp = (auth: GoogleAuth, api: WebApi, { spreadsheetId, onSpreadsheetId = () => undefined }: RenderOptions = { spreadsheetId: SHEET_ID }) => render(
  <MantineProvider env="test">
    <WebApp auth={auth} api={api} spreadsheetId={spreadsheetId} onSpreadsheetId={onSpreadsheetId} />
  </MantineProvider>,
)

const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element)
    await Promise.resolve()
  })
}

describe('WebApp', () => {
  afterEach(cleanup)

  it('asks for the sheet when it has none', async () => {
    const auth = fakeAuth(true)
    const chosen: (string | undefined)[] = []
    renderApp(auth, fakeApi(auth), {
      onSpreadsheetId: (id) => {
        chosen.push(id)
      },
    })
    fireEvent.change(screen.getByLabelText(/Google Sheet/), { target: { value: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit` } })
    await click(screen.getByRole('button', { name: 'Open' }))
    assert.deepEqual(chosen, [SHEET_ID])
    assert.ok(await screen.findByText('Ward Clerk'))
  })

  it('signs in, then shows every calling with who holds it and who is being considered', async () => {
    const auth = fakeAuth(false)
    renderApp(auth, fakeApi(auth))
    await click(screen.getByRole('button', { name: 'Sign in with Google' }))
    assert.ok(await screen.findByText('Bishop'))
    assert.ok(screen.getByText('Pratt, Orson'))
    assert.ok(screen.getByText('Vacant', { selector: '.mantine-Badge-label' }))
    assert.equal(screen.getByLabelText<HTMLTextAreaElement>('Notes on Abel, Bea for Ward Clerk').value, 'Good with numbers')
    assert.equal(screen.getByLabelText<HTMLInputElement>('Status of Abel, Bea for Ward Clerk').value, 'Pray about')
  })

  it('saves candidates picked from the member list', async () => {
    const auth = fakeAuth(true)
    const api = fakeApi(auth)
    renderApp(auth, api)
    const field = await screen.findByLabelText<HTMLInputElement>('Considering for Bishop')
    fireEvent.click(field)
    fireEvent.change(field, { target: { value: 'Bak' } })
    await click(await screen.findByRole('option', { name: 'Baker, Cal' }))
    assert.deepEqual(api.saved, [{ key: 'Bishop|p1|0', calling: 'Bishop', member: 'p1', candidates: [{ id: 'm2', notes: '' }] }])
    assert.ok(await screen.findByText(/All changes saved/))
  })

  it('filters by search and by what is being considered', async () => {
    const auth = fakeAuth(true)
    renderApp(auth, fakeApi(auth))
    await screen.findByText('Bishop')
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'numbers' } })
    assert.equal(screen.queryByText('Bishop'), null)
    assert.ok(screen.getByText('Ward Clerk'))
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Considering' }))
    assert.equal(screen.queryByText('Bishop'), null)
    assert.ok(screen.getByText('Ward Clerk'))
  })

  it('groups callings by organization, and shows one organization at a time', async () => {
    const auth = fakeAuth(true)
    const rows: Consideration[] = [
      { key: 'EQ Teacher|vacant|0', calling: 'Elders Quorum Teacher', member: '', organization: ['Elders Quorum', 'Teachers'], position: 2, candidates: [] },
      { key: 'Organist|vacant|0', calling: 'Organist', member: '', candidates: [] },
      ...ROWS.map((row, position) => ({ ...row, organization: ['Bishopric'], position })),
    ]
    renderApp(auth, fakeApi(auth, rows))
    await screen.findByText('Bishop')
    const headings = screen.getAllByRole('heading').filter(h => ['H2', 'H3'].includes(h.tagName)).map(h => h.textContent)
    assert.deepEqual(headings, ['Bishopric', 'Elders Quorum', 'Teachers', 'Not grouped yet'])
    assert.ok(within(screen.getByRole('region', { name: 'Bishopric' })).getByText('Ward Clerk'))

    const select = screen.getByRole<HTMLInputElement>('combobox', { name: 'Organization' })
    fireEvent.click(select)
    await click(await screen.findByRole('option', { name: 'Elders Quorum' }))
    assert.equal(select.value, 'Elders Quorum')
    assert.equal(screen.queryByText('Bishop'), null)
    assert.ok(screen.getByText('Elders Quorum Teacher'))

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'teachers' } })
    assert.ok(screen.getByText('Elders Quorum Teacher'))
  })

  it('saves where the calling is along with its candidates', async () => {
    const auth = fakeAuth(true)
    const api = fakeApi(auth, [{ ...ROWS[0], organization: ['Bishopric'], position: 0 } as Consideration])
    renderApp(auth, api)
    const field = await screen.findByLabelText<HTMLInputElement>('Considering for Bishop')
    fireEvent.click(field)
    fireEvent.change(field, { target: { value: 'Bak' } })
    await click(await screen.findByRole('option', { name: 'Baker, Cal' }))
    assert.deepEqual(api.saved, [{ key: 'Bishop|p1|0', calling: 'Bishop', member: 'p1', organization: ['Bishopric'], position: 0, candidates: [{ id: 'm2', notes: '' }] }])
  })

  it('keeps edits made after signing out, and saves them once signed in again', async () => {
    const auth = fakeAuth(true)
    const api = fakeApi(auth)
    renderApp(auth, api)
    const notes = await screen.findByLabelText<HTMLTextAreaElement>('Notes on Abel, Bea for Ward Clerk')
    auth.signedIn = false
    await act(async () => {
      fireEvent.change(notes, { target: { value: 'Ask in May' } })
      fireEvent.blur(notes)
      await Promise.resolve()
    })
    assert.ok(await screen.findByText(/Not saved: Signed out of Google/))
    assert.equal(api.saved.length, 0)

    await click(screen.getByRole('button', { name: 'Save again' }))
    assert.equal(auth.signIns, 1)
    assert.deepEqual(api.saved.map(c => c.candidates[0]?.notes), ['Ask in May'])
  })

  it('says when the extension hasn\'t copied member names to the sheet yet', async () => {
    const auth = fakeAuth(true)
    renderApp(auth, fakeApi(auth, ROWS, []))
    assert.ok(await screen.findByText(/No member names in the sheet yet/))
    assert.ok(screen.getByText('Someone not on the member list'))
  })
})
