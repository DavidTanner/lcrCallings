import { Alert, Anchor, Button, Container, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { needsAccess, type SheetMember } from '../src/background/sheets'
import { APP_NAME } from '../src/constants'
import type { Consideration } from '../src/shared/consideration'
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
  /**
   * Shows Google's file picker, on just `spreadsheetId` if given; resolves
   * with the sheet chosen, or undefined if cancelled. Needs to be signed in.
   */
  pickSheet: (spreadsheetId?: string) => Promise<string | undefined>
}

type State
  = | { step: 'signIn', error?: string }
    | { step: 'loading' }
    | { step: 'needsAccess', error?: string }
    | { step: 'ready', rows: Consideration[], members: SheetMember[] }
    | { step: 'failed', error: string }

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

/** The page for people who can't install the extension: the sheet's callings, editable */
export function WebApp({ auth, api, spreadsheetId: initialId, onSpreadsheetId, pageUrl, pickSheet }: WebAppProps) {
  const [spreadsheetId, setSpreadsheetId] = useState(initialId)
  const [state, setState] = useState<State>(() => auth.isSignedIn() ? { step: 'loading' } : { step: 'signIn' })

  /** What to show once the sheet is read */
  const readSheet = useCallback(async (id: string): Promise<State> => {
    try {
      const [rows, members] = await Promise.all([api.loadRows(id), api.loadMembers(id)])
      return { step: 'ready', rows, members }
    }
    catch (error) {
      if (error instanceof SignInRequired) return { step: 'signIn' }
      return needsAccess(error) ? { step: 'needsAccess' } : { step: 'failed', error: message(error) }
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

  /** Signs in if need be, then lets them choose the sheet in Google's picker */
  const choose = async (id?: string) => {
    await ensureSignedIn()
    const picked = await pickSheet(id)
    if (!picked) return
    if (picked === spreadsheetId) await load(picked)
    else changeSheet(picked)
  }

  const chooseAgain = async (id: string) => {
    try {
      await choose(id)
    }
    catch (error) {
      setState({ step: 'needsAccess', error: message(error) })
    }
  }

  const signOut = () => {
    auth.signOut()
    setState({ step: 'signIn' })
  }

  let body: ReactNode
  if (!spreadsheetId) {
    body = <Setup onChoose={() => choose()} />
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
      case 'needsAccess':
        body = (
          <Stack gap="sm" align="flex-start">
            <Text>
              {`Google lets ${APP_NAME} open only the sheets you choose for it. Choose this sheet to open it. If it isn't there, ask whoever shared the link to share the sheet with this Google account.`}
            </Text>
            {state.error && <Alert color="red" p="sm">{state.error}</Alert>}
            <Button size="md" onClick={() => void chooseAgain(spreadsheetId)}>Choose the sheet</Button>
          </Stack>
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
        <Group component="footer" gap="md" mt="xl">
          <Anchor href="/" size="sm" c="dimmed">{`About ${APP_NAME}`}</Anchor>
          <Anchor href="/privacy/" size="sm" c="dimmed">Privacy Policy</Anchor>
          <Anchor href="/terms/" size="sm" c="dimmed">Terms of Service</Anchor>
        </Group>
      </Stack>
    </Container>
  )
}

function Setup({ onChoose }: { onChoose: () => Promise<void> }) {
  const [error, setError] = useState<string>()

  const choose = async () => {
    setError(undefined)
    try {
      await onChoose()
    }
    catch (e) {
      setError(message(e))
    }
  }

  return (
    <Stack gap="sm" align="flex-start">
      <Text>Choose the Google Sheet the extension saves to. It needs to be shared with your Google account.</Text>
      {error && <Alert color="red" p="sm">{error}</Alert>}
      <Button size="md" onClick={() => void choose()}>Choose a Google Sheet</Button>
    </Stack>
  )
}
