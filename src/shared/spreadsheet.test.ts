import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSpreadsheetId } from './spreadsheet'

const ID = '1AbC-dEf_ghIJklMNopQRstuVWxyz0123456789'

describe('parseSpreadsheetId', () => {
  it('reads the id from a sheet URL', () => {
    assert.equal(parseSpreadsheetId(` https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0 `), ID)
  })

  it('accepts a bare id', () => {
    assert.equal(parseSpreadsheetId(ID), ID)
  })

  it('rejects anything else', () => {
    assert.equal(parseSpreadsheetId('https://example.com/sheet'), undefined)
    assert.equal(parseSpreadsheetId(''), undefined)
  })
})
