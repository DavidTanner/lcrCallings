import { type FetchFn, fetchPageData, type ServerAction } from './memberList'
import { type Member, parseFlight } from './members'

/** LCR's Organizations page, whose payload has every position with what it requires */
export const ORGANIZATIONS_PATH = '/mlt/orgs'

/** Who can hold a calling, as LCR's position types say */
export interface CallingRule {
  sex?: 'M' | 'F'
  minimumAge?: number
  /** must be baptized and confirmed */
  membersOnly?: boolean
  /** uuids of the organizations the calling is in, outermost first; a member must belong to one */
  organizations?: string[]
}

const SEXES: Partial<Record<string, 'M' | 'F'>> = { MALE_ONLY: 'M', FEMALE_ONLY: 'F' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The page shows custom callings with a "Custom Calling" badge after the name */
export const callingName = (calling: string) => calling.replace(/\s*Custom Calling$/, '')

function toRule(type: Record<string, unknown>, organizations: string[]): CallingRule {
  // minimumPriesthoodRequired is left out: sex and organization already narrow it, and LCR's is out of date for some callings
  const { sexRequired, minimumAge, nonMembersAllowed, unitOrgMembershipRequired } = type
  const sex = typeof sexRequired === 'string' ? SEXES[sexRequired] : undefined
  return {
    ...(sex ? { sex } : {}),
    ...(typeof minimumAge === 'number' && minimumAge > 0 ? { minimumAge } : {}),
    ...(nonMembersAllowed === false ? { membersOnly: true } : {}),
    ...(unitOrgMembershipRequired === true && organizations.length ? { organizations } : {}),
  }
}

/**
 * What each calling requires, by name, from an Organizations page payload.
 * Positions sit in nested organizations (`childUnitOrgs`), each with a uuid
 * that members' `associatedOrgUuids` refer to.
 */
export function parseCallingRules(payload: string): Map<string, CallingRule> {
  const rules = new Map<string, CallingRule>()
  const visit = (value: unknown, organizations: string[]) => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, organizations)
      return
    }
    if (!isRecord(value)) return
    const inside = typeof value.uuid === 'string' && ('positions' in value || 'childUnitOrgs' in value) ? [...organizations, value.uuid] : organizations
    const type = value.positionType
    // some position types are only listed for menus, without what they require
    if ('positionStatus' in value && isRecord(type) && typeof type.name === 'string' && 'sexRequired' in type && !rules.has(type.name)) {
      rules.set(type.name, toRule(type, inside))
    }
    for (const child of Object.values(value)) visit(child, inside)
  }
  for (const row of parseFlight(payload)) if (!row.tag) visit(row.value, [])
  return rules
}

/** Whether `member` can hold a calling with `rule`. What isn't known about them doesn't rule them out. */
export function qualifies(member: Pick<Member, 'sex' | 'age' | 'baptized' | 'organizations'>, rule: CallingRule): boolean {
  if (rule.sex && member.sex && member.sex !== rule.sex) return false
  if (rule.minimumAge !== undefined && member.age !== undefined && member.age < rule.minimumAge) return false
  if (rule.membersOnly && member.baptized === false) return false
  if (rule.organizations && member.organizations && !rule.organizations.some(o => member.organizations?.includes(o))) return false
  return true
}

/**
 * The action the Organizations page loads its organizations with. Only ever
 * one that reads them all, e.g. `getUnitOrgWrapper`, never one that could
 * change something or reads something else about them (`getUnitOrgMoveCandidate`).
 */
export function organizationsAction(actions: ServerAction[]): ServerAction | undefined {
  const reads = actions.filter(a => /^(get|fetch|load|list)(unit)?(orgs?|organizations?)(wrapper|list|data)?$/i.test(a.name))
  const unique = [...new Map(reads.map(a => [a.id, a])).values()]
  return unique.length === 1 ? unique[0] : undefined
}

/** Calling name → the `options` for `members` who can hold it; a calling without a rule isn't in it, so it lists everyone */
export function optionsByCalling<O extends { value: string }>(rules: Map<string, CallingRule> | undefined, members: (Pick<Member, 'uuid' | 'sex' | 'age' | 'baptized' | 'organizations'>)[], options: O[]): Map<string, O[]> {
  return new Map([...rules ?? []].map(([calling, rule]) => {
    const allowed = new Set(members.filter(m => qualifies(m, rule)).map(m => m.uuid))
    return [calling, options.filter(o => allowed.has(o.value))]
  }))
}

/** What each calling requires, by name, from LCR's Organizations page. Must run on LCR itself, for the session cookie. */
export function fetchCallingRules(origin: string, fetchFn: FetchFn = fetch, lang = 'eng'): Promise<Map<string, CallingRule>> {
  return fetchPageData(origin, fetchFn, lang, {
    path: ORGANIZATIONS_PATH,
    what: 'Organizations page',
    items: 'callings',
    parse: parseCallingRules,
    isEmpty: rules => !rules.size,
    pick: organizationsAction,
    args: [lang],
  })
}
