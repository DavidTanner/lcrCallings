// Chrome Web Store API (v2) client for scripts/publish.ts. It signs in as a
// Google Cloud service account, which (unlike an OAuth refresh token from a
// consent screen in Testing) doesn't expire after 7 days.
import { createSign } from 'node:crypto'

export const SCOPE = 'https://www.googleapis.com/auth/chromewebstore'
export const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://chromewebstore.googleapis.com'

/** The fields used from a service account's JSON key */
export interface ServiceAccount {
  client_email: string
  private_key: string
}

export interface Item {
  publisherId: string
  extensionId: string
}

type UploadState = 'UPLOAD_STATE_UNSPECIFIED' | 'SUCCEEDED' | 'IN_PROGRESS' | 'FAILED' | 'NOT_FOUND'

interface UploadResponse {
  crxVersion?: string
  uploadState?: UploadState
}

interface StatusResponse {
  lastAsyncUploadState?: UploadState
}

interface PublishResponse {
  state?: string
  warningInfo?: { warnings?: { reason?: string, description?: string }[] }
}

const base64url = (text: string) => Buffer.from(text).toString('base64url')

/** A signed JWT to trade for an access token; see https://developers.google.com/identity/protocols/oauth2/service-account#httprest */
export function serviceAccountJwt({ client_email, private_key }: ServiceAccount, now = Date.now()): string {
  const iat = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({ iss: client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }))
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(private_key, 'base64url')
  return `${header}.${claims}.${signature}`
}

export class WebStore {
  constructor(
    private readonly token: string,
    private readonly item: Item,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly pollMs = 5000,
  ) {}

  static async signIn(account: ServiceAccount, item: Item, fetchImpl: typeof fetch = fetch): Promise<WebStore> {
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountJwt(account) }),
    })
    if (!response.ok) throw new Error(`Couldn't sign in as ${account.client_email}: ${String(response.status)} ${await response.text()}`)
    const { access_token } = await response.json() as { access_token: string }
    return new WebStore(access_token, item, fetchImpl)
  }

  private get path() {
    return `publishers/${this.item.publisherId}/items/${this.item.extensionId}`
  }

  private async call<T>(url: string, init: { method?: string, headers?: Record<string, string>, body?: BodyInit } = {}): Promise<T> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...init.headers },
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} failed: ${String(response.status)} ${text}`)
    return JSON.parse(text) as T
  }

  /** Uploads a zip of the extension as the item's new draft, waiting for the store to process it */
  async upload(zip: Uint8Array<ArrayBuffer>, timeoutMs = 5 * 60_000): Promise<string | undefined> {
    const { crxVersion, uploadState } = await this.call<UploadResponse>(`${API}/upload/v2/${this.path}:upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: zip,
    })
    let state = uploadState
    const deadline = Date.now() + timeoutMs
    while (state === 'IN_PROGRESS') {
      if (Date.now() > deadline) throw new Error('The Chrome Web Store is still processing the upload. Check the Developer Dashboard.')
      await new Promise(resolve => setTimeout(resolve, this.pollMs))
      state = (await this.call<StatusResponse>(`${API}/v2/${this.path}:fetchStatus`)).lastAsyncUploadState
    }
    if (state !== 'SUCCEEDED') throw new Error(`Upload ${state ?? 'returned no state'}`)
    return crxVersion
  }

  /** Submits the uploaded draft for review; it goes live, with the item's current visibility, once approved */
  async publish(): Promise<PublishResponse> {
    return this.call<PublishResponse>(`${API}/v2/${this.path}:publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
    })
  }
}
