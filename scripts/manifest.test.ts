import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { describe, it } from 'node:test'
import { buildManifest, DEV_MATCH, extensionId, LCR_MATCH } from './manifest'

describe('buildManifest', () => {
  it('runs on LCR and can reach Google Sheets', () => {
    const manifest = buildManifest({ version: '1.2.3', description: 'd', clientId: 'client.apps.googleusercontent.com', key: 'KEY' })
    assert.equal(manifest.manifest_version, 3)
    assert.equal(manifest.version, '1.2.3')
    assert.equal(manifest.key, 'KEY')
    assert.deepEqual(manifest.content_scripts?.[0]?.matches, [LCR_MATCH])
    assert.deepEqual(manifest.host_permissions, [LCR_MATCH, 'https://sheets.googleapis.com/*'])
    assert.deepEqual(manifest.oauth2, { client_id: 'client.apps.googleusercontent.com', scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
  })

  it('also runs on the demo page in dev', () => {
    const manifest = buildManifest({ version: '1', description: 'd', dev: true })
    assert.deepEqual(manifest.content_scripts?.[0]?.matches, [LCR_MATCH, DEV_MATCH])
    assert.equal(manifest.oauth2, undefined)
  })
})

describe('extensionId', () => {
  it('is 32 letters a-p derived from the key', () => {
    const key = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    assert.match(extensionId(key), /^[a-p]{32}$/)
    assert.equal(extensionId(key), extensionId(key))
  })
})
