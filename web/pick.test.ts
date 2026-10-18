import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { PickRequest } from '../src/shared/picker'
import { fakePicker } from '../test/picker'
import { answerPicks, topOrigin } from './pick'

const CLIENT_ID = '185570875800-abc123.apps.googleusercontent.com'
const EXTENSION = 'chrome-extension://abcdefghijklmnop'

describe('answerPicks', () => {
  let frame: HTMLIFrameElement
  let win: Window

  beforeEach(() => {
    frame = document.createElement('iframe')
    document.body.append(frame)
    assert.ok(frame.contentWindow)
    win = frame.contentWindow
  })

  afterEach(() => {
    frame.remove()
    mock.restoreAll()
  })

  /** As if the extension's picker.html posted `data` to pick.html */
  const fromExtension = (data: PickRequest, origin = EXTENSION) => {
    win.dispatchEvent(new window.MessageEvent('message', { data, origin, source: window }))
  }

  it('says it\'s ready, then shows Google\'s picker with the extension\'s token and answers with the sheet chosen', async () => {
    const posted = mock.method(window, 'postMessage', () => undefined)
    const { picker, calls, respond } = fakePicker()
    assert.ok(answerPicks({ win, clientId: CLIENT_ID, apiKey: 'key', load: () => Promise.resolve(picker) }))
    assert.deepEqual(posted.mock.calls[0]?.arguments, [{ type: 'callings-pick-ready' }, '*'])

    fromExtension({ type: 'callings-pick', token: 'token', spreadsheetId: 'sheet1' })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(calls.token, 'token')
    assert.equal(calls.appId, '185570875800')
    assert.equal(calls.fileIds, 'sheet1')
    assert.deepEqual(posted.mock.calls[1]?.arguments, [{ type: 'callings-pick-shown' }, EXTENSION])

    respond({ action: 'picked', docs: [{ id: 'sheet1' }] })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(posted.mock.calls[2]?.arguments, [{ type: 'callings-picked', spreadsheetId: 'sheet1' }, EXTENSION])
  })

  it('takes tokens only from the extension', async () => {
    const posted = mock.method(window, 'postMessage', () => undefined)
    const { picker, calls } = fakePicker()
    answerPicks({ win, clientId: CLIENT_ID, load: () => Promise.resolve(picker) })
    fromExtension({ type: 'callings-pick', token: 'token' }, 'https://evil.example')
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(calls.token, undefined)
    assert.equal(posted.mock.callCount(), 1)
  })

  it('says why the picker couldn\'t be shown', async () => {
    const posted = mock.method(window, 'postMessage', () => undefined)
    answerPicks({ win, clientId: CLIENT_ID, load: () => Promise.reject(new Error('Couldn\'t load Google\'s file picker.')) })
    fromExtension({ type: 'callings-pick', token: 'token' })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(posted.mock.calls[1]?.arguments, [{ type: 'callings-pick-failed', error: 'Couldn\'t load Google\'s file picker.' }, EXTENSION])
  })

  it('does nothing when not framed', () => {
    assert.equal(answerPicks({ win: window, clientId: CLIENT_ID, load: () => Promise.reject(new Error('unused')) }), false)
  })
})

describe('topOrigin', () => {
  const at = (origin: string, ancestors?: string[]) => ({
    origin,
    ancestorOrigins: ancestors && { length: ancestors.length, item: (i: number) => ancestors[i] ?? null },
  }) as unknown as Location

  it('is the page at the top of the frames, which Google\'s picker insists on', () => {
    assert.equal(topOrigin(at('https://lcrcallings.click', ['chrome-extension://abcdefghijklmnop', 'https://lcr.churchofjesuschrist.org'])), 'https://lcr.churchofjesuschrist.org')
  })

  it('is the page\'s own when it isn\'t framed, or the browser doesn\'t say', () => {
    assert.equal(topOrigin(at('https://lcrcallings.click', [])), 'https://lcrcallings.click')
    assert.equal(topOrigin(at('https://lcrcallings.click')), 'https://lcrcallings.click')
  })
})
