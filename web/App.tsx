import { Alert, Button, Container, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import type { SheetMember } from '../src/background/sheets'
import { APP_NAME } from '../src/constants'
import type { Consideration } from '../src/shared/consideration'
import { parseSpreadsheetId } from '../src/shared/spreadsheet'
import { Board, type WebApi } from './Board'
import { type GoogleAuth, SignInRequired } from './google'

export interface WebAppProps {
  auth: GoogleAuth
  api: WebApi
  /** the sheet to open, if one was picked before or given in the link */
  spreadsheetId?: string
  /** remembers the sheet someone picked */
  onSpreadsheetId: (id: string | undefined) => void
  /** this page's address, to share links to it */
  pageUrl: string
}

type State
  = | { step: 'signIn', error?: string }
    | { step: 'loading' }
    | { step: 'ready', rows: Consideration[], members: SheetMember[] }
    | { step: 'failed', error: string }

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

/** The page for people who can't install the extension: the sheet's callings, editable */
export function WebApp({ auth, api, spreadsheetId: initialId, onSpreadsheetId, pageUrl }: WebAppProps) {
  const [spreadsheetId, setSpreadsheetId] = useState(initialId)
  const [state, setState] = useState<State>(() => auth.isSignedIn() ? { step: 'loading' } : { step: 'signIn' })

  /** What to show once the sheet is read */
  const readSheet = useCallback(async (id: string): Promise<State> => {
    try {
      const [rows, members] = await Promise.all([api.loadRows(id), api.loadMembers(id)])
      return { step: 'ready', rows, members }
    }
    catch (error) {
      return error instanceof SignInRequired ? { step: 'signIn' } : { step: 'failed', error: message(error) }
    }
  }, [api])

  const load = async (id: string) => {
    setState({ step: 'loading' })
    setState(await readSheet(id))
  }

  useEffect(() => {
    if (!spreadsheetId || !auth.isSignedIn()) return
    let live = true
    void readSheet(spreadsheetId).then((next) => {
      if (live) setState(next)
    })
    return () => {
      live = false
    }
  }, [auth, spreadsheetId, readSheet])

  const signIn = async () => {
    try {
      await auth.signIn()
      if (spreadsheetId) await load(spreadsheetId)
    }
    catch (error) {
      setState({ step: 'signIn', error: message(error) })
    }
  }

  const ensureSignedIn = useCallback(() => auth.isSignedIn() ? Promise.resolve() : auth.signIn(), [auth])

  const changeSheet = (id: string | undefined) => {
    setState(auth.isSignedIn() ? { step: 'loading' } : { step: 'signIn' })
    setSpreadsheetId(id)
    onSpreadsheetId(id)
  }

  const signOut = () => {
    auth.signOut()
    setState({ step: 'signIn' })
  }

  let body: ReactNode
  if (!spreadsheetId) {
    body = <Setup onConnect={changeSheet} />
  }
  else {
    switch (state.step) {
      case 'signIn':
        body = (
          <Stack gap="sm" align="flex-start">
            <Text>Sign in with the Google account the shared sheet is shared with.</Text>
            {state.error && <Alert color="red" p="sm">{state.error}</Alert>}
            <Button size="md" onClick={() => void signIn()}>Sign in with Google</Button>
          </Stack>
        )
        break
      case 'loading':
        body = (
          <Group gap="xs">
            <Loader size="sm" />
            <Text>Loading the sheet…</Text>
          </Group>
        )
        break
      case 'failed':
        body = (
          <Stack gap="sm" align="flex-start">
            <Alert color="red" title="Couldn't open the sheet">{state.error}</Alert>
            <Group>
              <Button onClick={() => void load(spreadsheetId)}>Try again</Button>
              <Button
                variant="default"
                onClick={() => {
                  changeSheet(undefined)
                }}
              >
                Change sheet
              </Button>
            </Group>
          </Stack>
        )
        break
      case 'ready':
        body = <Board api={api} spreadsheetId={spreadsheetId} rows={state.rows} members={state.members} pageUrl={pageUrl} ensureSignedIn={ensureSignedIn} />
        break
    }
  }

  return (
    <Container size="xl" py="md" px="md">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={1} size="h2">{APP_NAME}</Title>
          {spreadsheetId && state.step !== 'signIn' && (
            <Group gap={4}>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => {
                  changeSheet(undefined)
                }}
              >
                Change sheet
              </Button>
              <Button size="xs" variant="subtle" onClick={signOut}>Sign out</Button>
            </Group>
          )}
        </Group>
        {body}
      </Stack>
    </Container>
  )
}

function Setup({ onConnect }: { onConnect: (spreadsheetId: string) => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string>()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const id = parseSpreadsheetId(url)
        if (id) onConnect(id)
        else setError('Paste the link to a Google Sheet')
      }}
    >
      <Stack gap="sm">
        <TextInput
          size="md"
          label="Google Sheet"
          description="Paste the link to the sheet the extension saves to."
          placeholder="https://docs.google.com/spreadsheets/d/…"
          value={url}
          error={error}
          onChange={(event) => {
            setUrl(event.currentTarget.value)
            setError(undefined)
          }}
        />
        <Button size="md" type="submit">Open</Button>
      </Stack>
    </form>
  )
}
