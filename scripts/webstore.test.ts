import assert from 'node:assert/strict'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { describe, it } from 'node:test'
import { SCOPE, serviceAccountJwt, TOKEN_URL, WebStore } from './webstore'

const item = { publisherId: 'pub', extensionId: 'ext' }

function fakeFetch(responses: unknown[]) {
  const calls: { url: string, init?: RequestInit }[] = []
  const impl: typeof fetch = (url, init) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init })
    const body = responses.shift()
    return Promise.resolve(body instanceof Response ? body : Response.json(body))
  }
  return { calls, impl }
}

describe('serviceAccountJwt', () => {
  it('is signed by the service account and asks for the Chrome Web Store scope', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const jwt = serviceAccountJwt({ client_email: 'sa@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }, 1_000_000)
    const [header = '', claims = '', signature = ''] = jwt.split('.')
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' })
    assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url').toString()), {
      iss: 'sa@p.iam.gserviceaccount.com', scope: SCOPE, aud: TOKEN_URL, iat: 1000, exp: 4600,
    })
    assert.ok(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, signature, 'base64url'))
  })
})

describe('WebStore', () => {
  it('uploads, waits while the store processes it, then publishes', async () => {
    const { calls, impl } = fakeFetch([
      { crxVersion: '1.2.3', uploadState: 'IN_PROGRESS' },
      { lastAsyncUploadState: 'IN_PROGRESS' },
      { lastAsyncUploadState: 'SUCCEEDED' },
      { state: 'PENDING_REVIEW' },
    ])
    const store = new WebStore('token', item, impl, 0)
    assert.equal(await store.upload(new Uint8Array([1, 2, 3])), '1.2.3')
    assert.equal((await store.publish()).state, 'PENDING_REVIEW')
    assert.deepEqual(calls.map(({ url, init }) => `${init?.method ?? 'GET'} ${url}`), [
      'POST https://chromewebstore.googleapis.com/upload/v2/publishers/pub/items/ext:upload',
      'GET https://chromewebstore.googleapis.com/v2/publishers/pub/items/ext:fetchStatus',
      'GET https://chromewebstore.googleapis.com/v2/publishers/pub/items/ext:fetchStatus',
      'POST https://chromewebstore.googleapis.com/v2/publishers/pub/items/ext:publish',
    ])
    assert.deepEqual(calls[0]?.init?.headers, { 'Authorization': 'Bearer token', 'Content-Type': 'application/zip' })
  })

  it('fails when the store rejects the upload', async () => {
    const { impl } = fakeFetch([{ uploadState: 'FAILED' }])
    await assert.rejects(new WebStore('token', item, impl, 0).upload(new Uint8Array()), /Upload FAILED/)
  })

  it('reports errors from the API', async () => {
    const { impl } = fakeFetch([new Response('version must be greater', { status: 400 })])
    await assert.rejects(new WebStore('token', item, impl, 0).upload(new Uint8Array()), /400 version must be greater/)
  })

  it('signs in with the service account', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const { calls, impl } = fakeFetch([{ access_token: 'abc' }, { state: 'PUBLISHED' }])
    const store = await WebStore.signIn({ client_email: 'sa@p', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }, item, impl)
    await store.publish()
    const [signIn, publish] = calls
    assert.equal(signIn?.url, TOKEN_URL)
    const body = signIn.init?.body
    assert.ok(body instanceof URLSearchParams)
    assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
    assert.equal((publish?.init?.headers as Record<string, string>).Authorization, 'Bearer abc')
  })
})
