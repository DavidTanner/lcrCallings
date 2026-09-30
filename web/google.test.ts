import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createGoogleAuth, SignInRequired } from './google'

type Gis = Parameters<typeof createGoogleAuth>[0]
type Config = Parameters<Gis['accounts']['oauth2']['initTokenClient']>[0]

/** Google Identity Services, answering each token request with the next of `responses` */
function fakeGis() {
  let config: Config | undefined
  const revoked: string[] = []
  const gis: Gis = {
    accounts: {
      oauth2: {
        initTokenClient: (c) => {
          config = c
          return { requestAccessToken: () => undefined }
        },
        revoke: (token) => {
          revoked.push(token)
        },
      },
    },
  }
  return {
    gis,
    revoked,
    grant: (token: string, expiresIn = 3600) => {
      config?.callback({ access_token: token, expires_in: expiresIn })
    },
    fail: (type: string) => config?.error_callback?.({ type }),
  }
}

function memory() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
    removeItem: (key: string) => items.delete(key),
  }
}

describe('createGoogleAuth', () => {
  it('asks for sign-in until a token is granted, then hands it out', async () => {
    const google = fakeGis()
    const auth = createGoogleAuth(google.gis, 'client', memory())
    assert.equal(auth.isSignedIn(), false)
    await assert.rejects(auth.tokens.get(), SignInRequired)
    const signedIn = auth.signIn()
    google.grant('t1')
    await signedIn
    assert.equal(await auth.tokens.get(), 't1')
  })

  it('keeps the token across reloads until it is about to expire', async () => {
    const google = fakeGis()
    const storage = memory()
    let now = 0
    const signedIn = createGoogleAuth(google.gis, 'client', storage, () => now).signIn()
    google.grant('t1', 3600)
    await signedIn
    const reloaded = createGoogleAuth(fakeGis().gis, 'client', storage, () => now)
    assert.equal(await reloaded.tokens.get(), 't1')
    now = 3_540_001
    assert.equal(reloaded.isSignedIn(), false)
  })

  it('forgets a token Google rejected', async () => {
    const google = fakeGis()
    const auth = createGoogleAuth(google.gis, 'client', memory())
    const signedIn = auth.signIn()
    google.grant('t1')
    await signedIn
    await auth.tokens.invalidate('t1')
    await assert.rejects(auth.tokens.get(), SignInRequired)
  })

  it('reports a closed popup', async () => {
    const google = fakeGis()
    const signedIn = createGoogleAuth(google.gis, 'client', memory()).signIn()
    google.fail('popup_closed')
    await assert.rejects(signedIn, { message: 'Sign-in was cancelled' })
  })

  it('revokes the token when signing out', async () => {
    const google = fakeGis()
    const auth = createGoogleAuth(google.gis, 'client', memory())
    const signedIn = auth.signIn()
    google.grant('t1')
    await signedIn
    auth.signOut()
    assert.deepEqual(google.revoked, ['t1'])
    assert.equal(auth.isSignedIn(), false)
  })
})
