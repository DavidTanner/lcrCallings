import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isPickMessage, pickPageUrl } from './picker'

describe('pickPageUrl', () => {
  it('is next to the web page', () => {
    assert.equal(pickPageUrl('https://lcrcallings.click/app/'), 'https://lcrcallings.click/app/pick.html')
    assert.equal(pickPageUrl('https://lcrcallings.click/app?sheet=x#y'), 'https://lcrcallings.click/app/pick.html')
    assert.equal(pickPageUrl('http://127.0.0.1:8002'), 'http://127.0.0.1:8002/pick.html')
  })
})

describe('isPickMessage', () => {
  it('knows the picker\'s messages from anything else posted to the page', () => {
    assert.ok(isPickMessage({ type: 'callings-picked', spreadsheetId: 'x' }))
    assert.ok(!isPickMessage({ type: 'something-else' }))
    assert.ok(!isPickMessage('callings-picked'))
    assert.ok(!isPickMessage(null))
  })
})
