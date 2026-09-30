import type { CallingInfo } from '../src/useConsiderations'

/** Heads the callings the sheet doesn't say the organization of */
export const UNGROUPED = 'Not grouped yet'

/** Between the headings within an organization, e.g. `Priests Quorum › Priests Quorum Presidency` */
const SUBGROUP_SEPARATOR = ' › '

/** Callings under the same headings within an organization */
export interface Group<T> {
  /** the headings under the organization's, joined; '' for callings right under it */
  name: string
  rows: T[]
}

/** One of LCR's organizations, e.g. Elders Quorum, with its callings by group */
export interface Organization<T> {
  name: string
  groups: Group<T>[]
}

const MAX_POSITION = Number.MAX_SAFE_INTEGER

/**
 * Callings by organization, then by the headings within it, in the order the
 * Organizations page has them. Callings without a place on the page keep
 * their order in the sheet, and those without an organization come last.
 */
export function byOrganization<T extends CallingInfo>(rows: T[]): Organization<T>[] {
  // sort is stable, so rows without a position stay in sheet order
  const ordered = [...rows].sort((a, b) => (a.position ?? MAX_POSITION) - (b.position ?? MAX_POSITION))
  const organizations = new Map<string, { name: string, groups: Map<string, Group<T>> }>()
  for (const row of ordered) {
    const [name = UNGROUPED, ...headings] = row.organization ?? []
    let organization = organizations.get(name)
    if (!organization) {
      organization = { name, groups: new Map() }
      organizations.set(name, organization)
    }
    const groupName = headings.join(SUBGROUP_SEPARATOR)
    let group = organization.groups.get(groupName)
    if (!group) {
      group = { name: groupName, rows: [] }
      organization.groups.set(groupName, group)
    }
    group.rows.push(row)
  }
  const result = [...organizations.values()].map(({ name, groups }) => ({ name, groups: [...groups.values()] }))
  return [...result.filter(o => o.name !== UNGROUPED), ...result.filter(o => o.name === UNGROUPED)]
}
