import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { PickMessage, PickResult } from '../shared/picker'
import { runPickerFrame } from './frame'

const WEB_URL = 'https://lcrcallings.click/app/'

const pickFrame = () => document.querySelector<HTMLIFrameElement>('#pick')

/** As if pick.html posted `data` to this page */
function fromPage(data: PickMessage, origin = 'https://lcrcallings.click') {
  window.dispatchEvent(new window.MessageEvent('message', { data, origin, source: pickFrame()?.contentWindow }))
}

function run(options: Partial<Parameters<typeof runPickerFrame>[0]> = {}) {
  const told: PickResult[] = []
  const running = runPickerFrame({
    doc: document,
    webUrl: WEB_URL,
    getToken: () => Promise.resolve('token'),
    tell: (result) => {
      told.push(result)
    },
    ...options,
  })
  return { told, running }
}

describe('runPickerFrame', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="cancel" type="button">Cancel</button>'
    document.body.className = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('frames the web page\'s pick.html, hands it the token, and passes back the sheet chosen', async () => {
    const { told, running } = run({ spreadsheetId: 'sheet1' })
    await running
    const frame = pickFrame()
    assert.equal(frame?.src, 'https://lcrcallings.click/app/pick.html')
    assert.ok(frame.contentWindow)
    const posted = mock.method(frame.contentWindow, 'postMessage', () => undefined)

    fromPage({ type: 'callings-pick-ready' })
    assert.deepEqual(posted.mock.calls[0]?.arguments, [{ type: 'callings-pick', token: 'token', spreadsheetId: 'sheet1' }, 'https://lcrcallings.click'])

    fromPage({ type: 'callings-pick-shown' })
    assert.ok(document.body.classList.contains('shown'))
    assert.deepEqual(told, [])

    fromPage({ type: 'callings-picked', spreadsheetId: 'sheet1' })
    assert.deepEqual(told, [{ type: 'callings-picked', spreadsheetId: 'sheet1' }])
  })

  it('ignores messages from anywhere but pick.html', async () => {
    const { told, running } = run()
    await running
    fromPage({ type: 'callings-picked', spreadsheetId: 'evil' }, 'https://evil.example')
    assert.deepEqual(told, [])
    fromPage({ type: 'callings-pick-failed', error: 'Couldn\'t load Google\'s file picker.' })
    assert.deepEqual(told, [{ type: 'callings-pick-failed', error: 'Couldn\'t load Google\'s file picker.' }])
  })

  it('answers nothing chosen when cancelled', async () => {
    const { told, running } = run()
    await running
    document.getElementById('cancel')?.click()
    fromPage({ type: 'callings-picked', spreadsheetId: 'sheet1' })
    assert.deepEqual(told, [{ type: 'callings-picked' }])
  })

  it('gives up if the web page doesn\'t load', async () => {
    const { told, running } = run({ readyTimeoutMs: 1 })
    await running
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.deepEqual(told, [{ type: 'callings-pick-failed', error: 'Couldn\'t reach the LCR Callings web page at https://lcrcallings.click, which shows Google\'s file picker.' }])
  })

  it('gives up if the picker doesn\'t show', async () => {
    const { told, running } = run({ readyTimeoutMs: 1, showTimeoutMs: 20 })
    await running
    const frame = pickFrame()
    assert.ok(frame?.contentWindow)
    mock.method(frame.contentWindow, 'postMessage', () => undefined)
    fromPage({ type: 'callings-pick-ready' })
    await new Promise(resolve => setTimeout(resolve, 10))
    assert.deepEqual(told, [])
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.deepEqual(told, [{ type: 'callings-pick-failed', error: 'Couldn\'t open Google\'s file picker. Check the connection and try again.' }])
  })

  it('fails without a token or the web page\'s address', async () => {
    const noToken = run({ getToken: () => Promise.reject(new Error('Google sign-in was cancelled')) })
    await noToken.running
    assert.deepEqual(noToken.told, [{ type: 'callings-pick-failed', error: 'Google sign-in was cancelled' }])
    assert.equal(pickFrame(), null)

    const noWebUrl = run({ webUrl: undefined })
    await noWebUrl.running
    assert.match(noWebUrl.told[0]?.type === 'callings-pick-failed' ? noWebUrl.told[0].error : '', /doesn't know where/)
  })
})
