import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CallingInfo } from '../src/useConsiderations'
import { byOrganization, UNGROUPED } from './organizations'

const calling = (name: string, organization?: string[], position?: number): CallingInfo =>
  ({ key: `${name}|vacant|0`, calling: name, member: '', ...(organization ? { organization } : {}), ...(position === undefined ? {} : { position }) })

const shape = (rows: CallingInfo[]) => byOrganization(rows).map(o => ({ name: o.name, groups: o.groups.map(g => [g.name, ...g.rows.map(r => r.calling)]) }))

describe('byOrganization', () => {
  it('groups callings by organization, then the headings within it, in page order', () => {
    assert.deepEqual(shape([
      calling('Deacons Quorum Adviser', ['Aaronic Priesthood Quorums', 'Deacons Quorum', 'Deacons Quorum Adult Leaders'], 5),
      calling('Elders Quorum Teacher', ['Elders Quorum', 'Teachers'], 3),
      calling('Bishop', ['Bishopric'], 0),
      calling('Elders Quorum President', ['Elders Quorum', 'Elders Quorum Presidency'], 2),
      calling('Ward Clerk', ['Bishopric'], 1),
      calling('Priests Quorum Adviser', ['Aaronic Priesthood Quorums', 'Priests Quorum'], 4),
    ]), [
      { name: 'Bishopric', groups: [['', 'Bishop', 'Ward Clerk']] },
      { name: 'Elders Quorum', groups: [['Elders Quorum Presidency', 'Elders Quorum President'], ['Teachers', 'Elders Quorum Teacher']] },
      { name: 'Aaronic Priesthood Quorums', groups: [['Priests Quorum', 'Priests Quorum Adviser'], ['Deacons Quorum › Deacons Quorum Adult Leaders', 'Deacons Quorum Adviser']] },
    ])
  })

  it('keeps sheet order for callings without a position, and puts those without an organization last', () => {
    assert.deepEqual(shape([
      calling('Organist'),
      calling('Primary Teacher', ['Primary']),
      calling('Bishop', ['Bishopric'], 0),
      calling('Nursery Leader', ['Primary']),
    ]), [
      { name: 'Bishopric', groups: [['', 'Bishop']] },
      { name: 'Primary', groups: [['', 'Primary Teacher', 'Nursery Leader']] },
      { name: UNGROUPED, groups: [['', 'Organist']] },
    ])
  })
})
