import type { TokenProvider } from '../src/background/sheets'

/** Google Identity Services, which gives the page tokens for the Sheets API */
const GIS_URL = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
/** Tokens are treated as expired this long before Google says, so a save doesn't race the expiry */
const EXPIRY_MARGIN_MS = 60_000

interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken: () => void
}

interface Gis {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type: string, message?: string }) => void
      }) => TokenClient
      revoke: (token: string, done?: () => void) => void
    }
  }
}

declare global {
  interface Window {
    google?: Gis
  }
}

/** Thrown when there's no token, or it expired: someone has to press a button to sign in again */
export class SignInRequired extends Error {
  constructor() {
    super('Signed out of Google. Sign in again to continue.')
  }
}

/** Adds Google's sign-in script to the page, once */
export function loadGis(doc: Document = document): Promise<Gis> {
  const view = doc.defaultView
  if (view?.google) return Promise.resolve(view.google)
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script')
    script.src = GIS_URL
    script.async = true
    script.onload = () => {
      if (view?.google) resolve(view.google)
      else reject(new Error('Google sign-in didn\'t load'))
    }
    script.onerror = () => {
      reject(new Error('Couldn\'t load Google sign-in. Check the connection and reload.'))
    }
    doc.head.append(script)
  })
}

interface StoredToken {
  token: string
  /** ms since the epoch */
  expiresAt: number
}

export interface GoogleAuth {
  /** for the Sheets client; rejects with `SignInRequired` rather than showing a popup, which needs a tap */
  tokens: TokenProvider
  isSignedIn: () => boolean
  /**
   * Asks Google for a token in a popup. Call it straight from a tap or
   * click, or Safari blocks the popup.
   */
  signIn: () => Promise<void>
  signOut: () => void
}

/**
 * Signs in with Google in the browser. The token lasts an hour and is kept in
 * `storage` (session storage, so it's gone with the tab) to survive reloads.
 */
export function createGoogleAuth(gis: Gis, clientId: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, now = Date.now): GoogleAuth {
  const KEY = 'callings-google-token'

  const read = (): StoredToken | undefined => {
    try {
      const stored = JSON.parse(storage.getItem(KEY) ?? 'null') as Partial<StoredToken> | null
      if (typeof stored?.token === 'string' && typeof stored.expiresAt === 'number' && stored.expiresAt > now()) {
        return { token: stored.token, expiresAt: stored.expiresAt }
      }
    }
    catch { /* nothing usable stored */ }
    return undefined
  }
  const clear = () => {
    storage.removeItem(KEY)
  }

  let waiting: { resolve: () => void, reject: (error: Error) => void } | undefined
  const settle = (error?: Error) => {
    const current = waiting
    waiting = undefined
    if (error) current?.reject(error)
    else current?.resolve()
  }

  const client = gis.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: (response) => {
      if (!response.access_token) {
        settle(new Error(response.error_description ?? response.error ?? 'Google sign-in failed'))
        return
      }
      const expiresIn = Number(response.expires_in ?? 3600) * 1000
      storage.setItem(KEY, JSON.stringify({ token: response.access_token, expiresAt: now() + expiresIn - EXPIRY_MARGIN_MS }))
      settle()
    },
    error_callback: (error) => {
      settle(new Error(error.type === 'popup_closed' ? 'Sign-in was cancelled' : error.message ?? 'Google sign-in failed'))
    },
  })

  return {
    tokens: {
      get: () => {
        const stored = read()
        return stored ? Promise.resolve(stored.token) : Promise.reject(new SignInRequired())
      },
      invalidate: (token) => {
        if (read()?.token === token) clear()
        return Promise.resolve()
      },
    },
    isSignedIn: () => read() !== undefined,
    signIn: () => {
      settle(new Error('Sign-in was cancelled'))
      const done = new Promise<void>((resolve, reject) => {
        waiting = { resolve, reject }
      })
      client.requestAccessToken()
      return done
    },
    signOut: () => {
      const stored = read()
      clear()
      if (stored) gis.accounts.oauth2.revoke(stored.token)
    },
  }
}
