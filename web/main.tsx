import { Alert, Center, Loader, MantineProvider } from '@mantine/core'
import mantineCss from '@mantine/core/styles.css'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createSheetsClient } from '../src/background/sheets'
import { parseSpreadsheetId } from '../src/shared/spreadsheet'
import { WebApp } from './App'
import type { WebApi } from './Board'
import { createGoogleAuth, type GoogleAuth, loadGis } from './google'

// set when building, from the environment (see scripts/web.ts)
const CLIENT_ID = process.env.WEB_OAUTH_CLIENT_ID ?? ''
const DEFAULT_SPREADSHEET_ID = process.env.SPREADSHEET_ID ?? ''

const SPREADSHEET_ID_KEY = 'callings-spreadsheet-id'

type SimpleStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** `storage`, or somewhere in memory where the browser won't store anything, e.g. a private window */
function usable(storage: () => Storage): SimpleStorage {
  try {
    const s = storage()
    s.setItem('callings-check', '1')
    s.removeItem('callings-check')
    return s
  }
  catch {
    const items = new Map<string, string>()
    return {
      getItem: key => items.get(key) ?? null,
      setItem: (key, value) => items.set(key, value),
      removeItem: key => items.delete(key),
    }
  }
}

const local = usable(() => localStorage)
const session = usable(() => sessionStorage)

/** A sheet in the link (`?sheet=<link or id>`) wins over the one picked last time */
function initialSpreadsheetId() {
  const fromLink = parseSpreadsheetId(new URLSearchParams(location.search).get('sheet') ?? '')
  if (fromLink) {
    local.setItem(SPREADSHEET_ID_KEY, fromLink)
    return fromLink
  }
  return local.getItem(SPREADSHEET_ID_KEY) ?? (DEFAULT_SPREADSHEET_ID || undefined)
}

const saveSpreadsheetId = (id: string | undefined) => {
  if (id) local.setItem(SPREADSHEET_ID_KEY, id)
  else local.removeItem(SPREADSHEET_ID_KEY)
}

function Root() {
  const [google, setGoogle] = useState<{ auth: GoogleAuth, api: WebApi }>()
  const [error, setError] = useState<string>()
  const [spreadsheetId] = useState(initialSpreadsheetId)

  useEffect(() => {
    if (!CLIENT_ID) return
    loadGis().then(
      (gis) => {
        const auth = createGoogleAuth(gis, CLIENT_ID, session)
        setGoogle({ auth, api: createSheetsClient(auth.tokens) })
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
      },
    )
  }, [])

  if (!CLIENT_ID) return <Alert color="red" m="md" title="Not set up">This page was built without WEB_OAUTH_CLIENT_ID. See the README.</Alert>
  if (error) return <Alert color="red" m="md">{error}</Alert>
  if (!google) return <Center h="100vh"><Loader /></Center>
  return <WebApp auth={google.auth} api={google.api} spreadsheetId={spreadsheetId} onSpreadsheetId={saveSpreadsheetId} pageUrl={location.href} />
}

const style = document.createElement('style')
style.textContent = mantineCss
document.head.append(style)

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <MantineProvider defaultColorScheme="auto">
        <Root />
      </MantineProvider>
    </StrictMode>,
  )
}
