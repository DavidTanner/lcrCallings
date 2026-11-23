import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { memberLabel, tenure } from './CandidatesField'

describe('tenure', () => {
  const today = new Date(2026, 10, 22)
  it('counts whole years, from the anniversary on', () => {
    assert.equal(tenure('2024-11-22', today), '2 yrs')
    assert.equal(tenure('2024-11-23', today), '1 yr')
    assert.equal(tenure('2026-01-07', today), 'under 1 yr')
  })
})

describe('memberLabel', () => {
  it('adds what is known of sex and age', () => {
    assert.equal(memberLabel({ name: 'Abel, Bea', sex: 'F', age: 34 }), 'Abel, Bea (F, 34)')
    assert.equal(memberLabel({ name: 'Abel, Bea' }), 'Abel, Bea')
  })
})
