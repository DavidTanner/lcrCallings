import { ActionIcon, Alert, Button, Group, Loader, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { APP_NAME } from './constants'
import type { ExtensionApi } from './content/api'
import { COLUMN_TITLE } from './page/enhance'
import type { Candidate } from './shared/consideration'
import { parseSpreadsheetId } from './shared/spreadsheet'
import { Tracker } from './Tracker'

export interface AppProps {
  /** the LCR page to add the column to */
  doc: Document
  api: ExtensionApi
  onClose: () => void
}

type State
  = | { step: 'starting' }
    | { step: 'setup' }
    | { step: 'connecting', spreadsheetId: string }
    | { step: 'ready', spreadsheetId: string, values: Record<string, Candidate[]> }
    | { step: 'failed', spreadsheetId: string, error: string }

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export function App({ doc, api, onClose }: AppProps) {
  const [state, setState] = useState<State>({ step: 'starting' })

  const connect = useCallback(async (spreadsheetId: string) => {
    setState({ step: 'connecting', spreadsheetId })
    try {
      const values = await api.load(spreadsheetId)
      await api.setSpreadsheetId(spreadsheetId)
      setState({ step: 'ready', spreadsheetId, values })
    }
    catch (error) {
      setState({ step: 'failed', spreadsheetId, error: message(error) })
    }
  }, [api])

  useEffect(() => {
    void api.getSpreadsheetId().then(async (id) => {
      if (id) await connect(id)
      else setState({ step: 'setup' })
    })
  }, [api, connect])

  const changeSheet = () => {
    setState({ step: 'setup' })
  }

  let body: ReactNode
  switch (state.step) {
    case 'starting':
    case 'connecting':
      body = (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm">Connecting to Google Sheets…</Text>
        </Group>
      )
      break
    case 'setup':
      body = <Setup onConnect={id => void connect(id)} />
      break
    case 'failed':
      body = (
        <>
          <Alert color="red" title="Couldn't open the sheet">{state.error}</Alert>
          <Group>
            <Button size="xs" onClick={() => void connect(state.spreadsheetId)}>Try again</Button>
            <Button size="xs" variant="default" onClick={changeSheet}>Change sheet</Button>
          </Group>
        </>
      )
      break
    case 'ready':
      body = <Tracker doc={doc} api={api} spreadsheetId={state.spreadsheetId} initial={state.values} onChangeSheet={changeSheet} />
      break
  }

  return (
    <Paper shadow="lg" radius="md" p="md" withBorder w={340}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>{APP_NAME}</Title>
          <ActionIcon variant="subtle" color="gray" aria-label="Close" onClick={onClose}>
            ×
          </ActionIcon>
        </Group>
        {body}
      </Stack>
    </Paper>
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
          label="Google Sheet"
          description={`Share a sheet with everyone who should see the ${COLUMN_TITLE} column, then paste its link.`}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          value={url}
          error={error}
          onChange={(event) => {
            setUrl(event.currentTarget.value)
            setError(undefined)
          }}
        />
        <Button type="submit">Connect</Button>
      </Stack>
    </form>
  )
}
