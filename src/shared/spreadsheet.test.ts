import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSpreadsheetId, webPageLink } from './spreadsheet'

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

describe('webPageLink', () => {
  it('links to the web page with the sheet in it', () => {
    assert.equal(webPageLink('https://example.gitlab.io/callings/', ID), `https://example.gitlab.io/callings/?sheet=${ID}`)
  })

  it('replaces the sheet already in the link, and keeps the rest', () => {
    assert.equal(webPageLink('https://example.gitlab.io/callings/?sheet=old&x=1#top', ID), `https://example.gitlab.io/callings/?sheet=${ID}&x=1`)
  })
})
