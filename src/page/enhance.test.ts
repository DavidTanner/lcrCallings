import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { orgRow, orgTable } from '../../test/fixtures'
import { type CallingRow, type Enhancement, enhancePage, SLOT, slugify } from './enhance'

const labels = (row: Element) => [...row.children].map(cell =>
  cell.querySelector('.eden-table-card-view__cloned-column-header')?.textContent)
const slots = () => [...document.querySelectorAll<HTMLElement>(`tbody [${SLOT}]`)]

describe('slugify', () => {
  it('makes class-safe names', () => {
    assert.equal(slugify('Ward Assistant Clerk--Membership'), 'ward-assistant-clerk-membership')
    assert.equal(slugify('Course 15, Course 16'), 'course-15-course-16')
  })
})

describe('enhancePage', () => {
  let enhancement: Enhancement | undefined
  const enhance = () => (enhancement = enhancePage(document))

  beforeEach(() => {
    document.body.innerHTML = orgTable('Bishopric', [
      { calling: 'Bishop', person: 'p1' },
      { calling: 'Ward Clerk' },
    ]) + orgTable('Presidency of the Aaronic Priesthood', [
      { calling: 'Bishop', person: 'p1' },
    ])
  })

  afterEach(() => {
    enhancement?.cleanup()
    enhancement = undefined
  })

  it('adds a Considering column after Name', () => {
    enhance()
    for (const row of document.querySelectorAll('tr')) {
      assert.deepEqual(labels(row), ['Calling', 'Name', 'Considering', 'Sustained', 'Set Apart', ''])
    }
    assert.equal(document.querySelector('th[data-callings-column]')?.getAttribute('style'), '--x: 1')
    assert.equal(slots().length, 3)
  })

  it('classes each row by calling', () => {
    enhance()
    assert.deepEqual([...document.querySelectorAll('tbody tr')].map(r => r.className), [
      'callings-row callings-calling-bishop',
      'callings-row callings-calling-ward-clerk',
      'callings-row callings-calling-bishop',
    ])
  })

  it('reports each row, keyed by calling, holder and occurrence', () => {
    const rows = enhance().rows()
    assert.deepEqual(rows.map(({ key, calling, member }) => ({ key, calling, member })), [
      { key: 'Bishop|p1|0', calling: 'Bishop', member: 'p1' },
      { key: 'Ward Clerk|vacant|0', calling: 'Ward Clerk', member: '' },
      { key: 'Bishop|p1|1', calling: 'Bishop', member: 'p1' },
    ])
    assert.deepEqual(rows.map(r => r.slot), slots())
    assert.equal(rows[0]?.slot.getAttribute(SLOT), 'Bishop|p1|0')
  })

  it('is idempotent', () => {
    enhance()
    const html = document.body.innerHTML
    const again = enhancePage(document)
    assert.equal(document.body.innerHTML, html)
    again.cleanup()
  })

  it('enhances rows the page adds later, keeping the rows it already had', async () => {
    const passes: CallingRow[][] = []
    enhancement = enhancePage(document, rows => passes.push(rows))
    document.querySelector('tbody')?.insertAdjacentHTML('beforeend', orgRow({ calling: 'Ward Executive Secretary' }))
    await new Promise(resolve => setTimeout(resolve))
    const row = document.querySelector('.callings-calling-ward-executive-secretary')
    assert.ok(row)
    assert.equal(labels(row)[2], 'Considering')
    const [first, second] = passes
    assert.equal(first?.length, 3)
    assert.equal(second?.length, 4)
    assert.ok(first.every((r, i) => r === second[i === 2 ? 3 : i]))
  })

  it('restores the page exactly on cleanup', () => {
    const html = document.body.innerHTML
    enhance().cleanup()
    assert.equal(document.body.innerHTML, html)
  })
})
