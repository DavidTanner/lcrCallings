import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { PickResult } from '../shared/picker'
import { showPicker } from './picker'

const FRAME_URL = 'chrome-extension://abcdefghijklmnop/picker.html'

const frame = () => document.querySelector('iframe')

/** As if the picker frame posted `data` to the page */
function fromFrame(data: PickResult, { origin = 'chrome-extension://abcdefghijklmnop', source = frame()?.contentWindow } = {}) {
  window.dispatchEvent(new window.MessageEvent('message', { data, origin, source }))
}

describe('showPicker', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('covers the page with the extension\'s picker frame, on the sheet, and resolves with the one chosen', async () => {
    const picked = showPicker(document, FRAME_URL, 'sheet1')
    assert.equal(frame()?.src, `${FRAME_URL}?sheet=sheet1`)
    assert.equal(frame()?.style.position, 'fixed')

    fromFrame({ type: 'callings-pick-shown' })
    assert.ok(frame())
    fromFrame({ type: 'callings-picked', spreadsheetId: 'sheet2' })
    assert.equal(await picked, 'sheet2')
    assert.equal(frame(), null)
  })

  it('resolves with nothing when cancelled', async () => {
    const picked = showPicker(document, FRAME_URL)
    assert.equal(frame()?.src, FRAME_URL)
    fromFrame({ type: 'callings-picked' })
    assert.equal(await picked, undefined)
  })

  it('ignores messages from anywhere but its frame', async () => {
    const picked = showPicker(document, FRAME_URL)
    fromFrame({ type: 'callings-picked', spreadsheetId: 'evil' }, { origin: 'https://evil.example' })
    fromFrame({ type: 'callings-picked', spreadsheetId: 'evil' }, { source: window })
    assert.ok(frame())
    fromFrame({ type: 'callings-pick-failed', error: 'Couldn\'t open Google\'s file picker.' })
    await assert.rejects(picked, /Couldn't open Google's file picker/)
    assert.equal(frame(), null)
  })
})
