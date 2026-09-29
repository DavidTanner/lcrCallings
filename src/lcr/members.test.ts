import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseFlight, parseMembers } from './members'

const person = (uuid: string, name: string, sex = 'F') =>
  ({ uuid, name, nameSort: name.toUpperCase(), sex, currentUnitName: 'Test Ward' })

// Shaped like a saved /mlt/orgs response: text rows run straight into the next row
const css = '.a{content:"é"}\n.b{}'
const payload = [
  '2:I[1,["/chunk.js"],"default"]',
  ':HL["/style.css","style"]',
  `7:T${new TextEncoder().encode(css).length.toString(16)},${css}c:X`,
  `1:${JSON.stringify({
    unitOrgs: [{
      name: 'Bishopric',
      positions: [
        { positionType: { name: 'Bishop' }, person: person('u2', 'Zed, Ann', 'M') },
        { positionType: { name: 'Ward Clerk' } },
      ],
      childUnitOrgs: [{
        name: 'Aaronic Priesthood',
        positions: [
          { positionType: { name: 'Bishop' }, person: person('u2', 'Zed, Ann', 'M') },
          { positionType: { name: 'Adviser' }, person: person('u1', 'Abel, Bea') },
        ],
      }],
    }],
  })}`,
  '4:"$Sreact.fragment"',
  '',
].join('\n')

describe('parseFlight', () => {
  it('splits rows, including text rows that are not newline-terminated', () => {
    assert.deepEqual(parseFlight(payload).map(({ id, tag }) => `${id}:${tag}`), ['2:I', ':HL', '7:T', 'c:X', '1:', '4:'])
  })

  it('reads text rows by UTF-8 byte length', () => {
    assert.equal(parseFlight(payload).find(r => r.id === '7')?.value, css)
  })

  it('parses JSON rows', () => {
    const rows = parseFlight(payload)
    assert.equal(rows.find(r => r.id === '4')?.value, '$Sreact.fragment')
    assert.ok(typeof rows.find(r => r.id === '1')?.value === 'object')
  })
})

describe('parseMembers', () => {
  it('returns each person once, sorted by name', () => {
    assert.deepEqual(parseMembers(payload), [
      { uuid: 'u1', name: 'Abel, Bea', nameSort: 'ABEL, BEA', sex: 'F', currentUnitName: 'Test Ward' },
      { uuid: 'u2', name: 'Zed, Ann', nameSort: 'ZED, ANN', sex: 'M', currentUnitName: 'Test Ward' },
    ])
  })

  it('ignores person values that are not members', () => {
    assert.deepEqual(parseMembers(`1:${JSON.stringify({ person: '$1:a' })}\n2:${JSON.stringify({ person: { uuid: 'u' } })}\n`), [])
  })
})

describe('parseMembers, beyond the Organizations page', () => {
  it('finds members listed under other keys, when they have a nameSort', () => {
    const list = `1:${JSON.stringify({ members: [person('u3', 'Cole, Dee'), { uuid: 'org', name: 'Bishopric' }] })}\n`
    assert.deepEqual(parseMembers(list).map(m => m.uuid), ['u3'])
  })

  it('reads the Member List page\'s members, which keep their names in nameFormats', () => {
    const member = {
      uuid: 'u4',
      sex: 'FEMALE',
      currentUnitName: 'Test Ward',
      nameFormats: { listPreferredLocal: 'Dunn, Eve', listPreferredSort: 'DUNN, EVE', spokenPreferredLocal: 'Eve Dunn' },
    }
    assert.deepEqual(parseMembers(`1:${JSON.stringify({ members: [member] })}\n`), [
      { uuid: 'u4', name: 'Dunn, Eve', nameSort: 'DUNN, EVE', sex: 'F', currentUnitName: 'Test Ward' },
    ])
  })
})
