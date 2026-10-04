import { createHash } from 'node:crypto'
import { APP_NAME } from '../src/constants.ts'

export const LCR_MATCH = 'https://lcr.churchofjesuschrist.org/*'

export interface ManifestOptions {
  version: string
  description: string
  /** OAuth client id of type "Chrome Extension" from Google Cloud */
  clientId?: string
  /** public key (base64 DER) that pins the extension id; see scripts/keygen.ts */
  key?: string
  /** also run on the dev server's demo page */
  dev?: boolean
}

export function buildManifest({ version, description, clientId, key, dev }: ManifestOptions): chrome.runtime.ManifestV3 {
  const matches = [LCR_MATCH]
  return {
    manifest_version: 3,
    name: dev ? `${APP_NAME} (dev)` : APP_NAME,
    version,
    description,
    ...(key ? { key } : {}),
    action: { default_title: `Show ${APP_NAME}` },
    background: { service_worker: 'background.js', type: 'module' },
    content_scripts: [{ matches, js: ['content.js'], run_at: 'document_idle' }],
    // identity: Google sign-in; storage: remember the sheet; scripting: add the
    // content script to LCR tabs that were open before install
    permissions: ['identity', 'storage', 'scripting'],
    host_permissions: [...matches, 'https://sheets.googleapis.com/*'],
    ...(clientId ? { oauth2: { client_id: clientId, scopes: ['https://www.googleapis.com/auth/spreadsheets'] } } : {}),
  }
}

/** The id Chrome gives an extension with this public key (base64 DER) */
export function extensionId(key: string): string {
  const hash = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)
  // Chrome spells the first 128 bits of the hash with a-p instead of 0-f
  return hash.replace(/[0-9a-f]/g, c => String.fromCharCode(0x61 + parseInt(c, 16)))
}
