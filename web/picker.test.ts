import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fakePicker } from '../test/picker'
import { pickSpreadsheet, projectNumber } from './picker'

const options = { token: 'token', appId: '1234', origin: 'https://lcrcallings.click' }

describe('pickSpreadsheet', () => {
  it('shows sheets and resolves with the one chosen, granting access to the project', async () => {
    const { picker, calls, respond } = fakePicker()
    const picked = pickSpreadsheet(picker, { ...options, apiKey: 'key' })
    assert.equal(calls.visible, true)
    assert.equal(calls.viewId, 'spreadsheets')
    assert.equal(calls.fileIds, undefined)
    assert.equal(calls.token, 'token')
    assert.equal(calls.appId, '1234')
    assert.equal(calls.apiKey, 'key')
    respond({ action: 'loaded' })
    respond({ action: 'picked', docs: [{ id: 'sheet1' }] })
    assert.equal(await picked, 'sheet1')
  })

  it('opens on just the given sheet', async () => {
    const { picker, calls, respond } = fakePicker()
    const picked = pickSpreadsheet(picker, { ...options, spreadsheetId: 'sheet1' })
    assert.equal(calls.fileIds, 'sheet1')
    assert.equal(calls.apiKey, undefined)
    respond({ action: 'cancel' })
    assert.equal(await picked, undefined)
  })
})

describe('projectNumber', () => {
  it('is the start of the OAuth client id', () => {
    assert.equal(projectNumber('185570875800-abc123.apps.googleusercontent.com'), '185570875800')
    assert.equal(projectNumber('nonsense'), '')
  })
})
