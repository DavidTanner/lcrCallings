import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { type CallingRule, callingName, fetchCallingRules, ORGANIZATIONS_PATH, organizationsAction, parseCallingRules, qualifies } from './callingRules'
import type { Member } from './members'

const type = (name: string, rules: Record<string, unknown> = {}) => ({
  name,
  sexRequired: 'EITHER',
  minimumAge: 0,
  minimumPriesthoodRequired: 'NONE',
  nonMembersAllowed: true,
  unitOrgMembershipRequired: false,
  ...rules,
})
const position = (positionType: unknown, person?: unknown) => ({ uuid: 'p', positionType, positionStatus: person ? 'ACTIVE_POSITION' : 'VACANT_POSITION', ...(person ? { person } : {}) })

/** Shaped like a saved /mlt/orgs response */
const payload = `0:["$","div",null,{}]\n1:${JSON.stringify({
  positionTypes: [{ name: 'Bishop' }],
  unitOrgs: [{
    uuid: 'eq',
    name: 'Elders Quorum',
    childUnitOrgs: [{
      uuid: 'eq-teachers',
      name: 'Teachers',
      positions: [position(type('Elders Quorum Teacher', { sexRequired: 'MALE_ONLY', minimumAge: 18, minimumPriesthoodRequired: 'ELDER', nonMembersAllowed: false, unitOrgMembershipRequired: true }))],
    }],
  }, {
    uuid: 'ss',
    name: 'Sunday School',
    positions: [position(type('Sunday School President', { minimumPriesthoodRequired: 'ELDER' }), { uuid: 'm1' })],
  }],
})}\n`

const member = (fields: Partial<Member> = {}): Member => ({ uuid: 'm', name: 'Abel, Bea', nameSort: 'ABEL, BEA', ...fields })

describe('parseCallingRules', () => {
  it('reads what each calling requires, with the organizations it is in', () => {
    assert.deepEqual(Object.fromEntries(parseCallingRules(payload)), {
      'Elders Quorum Teacher': { sex: 'M', minimumAge: 18, membersOnly: true, organizations: ['eq', 'eq-teachers'] },
      // LCR's priesthood office isn't used
      'Sunday School President': {},
    })
  })
})

describe('callingName', () => {
  it('leaves off the page\'s Custom Calling badge', () => {
    assert.equal(callingName('Ward Digital MissionaryCustom Calling'), 'Ward Digital Missionary')
    assert.equal(callingName('Bishop'), 'Bishop')
  })
})

describe('qualifies', () => {
  const teacher = { sex: 'M', minimumAge: 18, membersOnly: true, organizations: ['eq', 'eq-teachers'] } satisfies CallingRule
  const elder = member({ sex: 'M', age: 30, baptized: true, organizations: ['eq'] })

  it('lets in members who meet every rule', () => {
    assert.equal(qualifies(elder, teacher), true)
  })

  it('leaves out members who miss any', () => {
    assert.equal(qualifies(member({ ...elder, sex: 'F' }), teacher), false)
    assert.equal(qualifies(member({ ...elder, age: 17 }), teacher), false)
    assert.equal(qualifies(member({ ...elder, baptized: false }), teacher), false)
    assert.equal(qualifies(member({ ...elder, organizations: ['rs'] }), teacher), false)
  })

  it('doesn\'t leave out anyone for what isn\'t known about them', () => {
    assert.equal(qualifies(member(), teacher), true)
  })
})

describe('organizationsAction', () => {
  it('picks the one that reads the organizations, from those the page has', () => {
    // the Organizations page's actions in November 2026
    const names = ['getTranslations', 'getMemberCallings', 'getBishopOrPatriarchOrdination', 'addVacantPosition', 'removeVacantPosition', 'movePosition', 'approvePosition', 'denyPosition', 'getMembersFromUuid', 'getYouthMinisteringFromUuid', 'mergeUnitOrg', 'splitUnitOrg', 'unmergeAllUnitOrg', 'unsplitUnitOrg', 'editUnitOrgNameAndRoom', 'resetClasses', 'getUnitOrgMoveCandidate', 'getUnitOrgWrapper', 'updatePosition', 'moveMembersToNewClass', 'getCountryList', 'getCountryAddressFields', 'searchPotentialOfficiators', 'getPositionDetails', 'getStatesList']
    assert.equal(organizationsAction(names.map(name => ({ id: name, name })))?.name, 'getUnitOrgWrapper')
    assert.equal(organizationsAction([{ id: 'a', name: 'getOrgMembers' }, { id: 'b', name: 'getUnitOrgs' }])?.id, 'b')
  })

  it('picks none when it can\'t tell which', () => {
    assert.equal(organizationsAction([{ id: 'a', name: 'getUnitOrgs' }, { id: 'b', name: 'getOrganizations' }]), undefined)
  })

  it('never picks one that could change something', () => {
    assert.equal(organizationsAction([{ id: 'a', name: 'saveUnitOrgs' }, { id: 'b', name: 'deleteOrg' }]), undefined)
  })
})

const ACTION_ID = '40d401fa32b76ee10ebe0588754f3a06f7a35202d7'
const CHUNK = '/mlt/_next/static/chunks/0abc-def.js'

describe('fetchCallingRules', () => {
  it('reads the page\'s payload when it has the callings', async () => {
    const calls: string[] = []
    const rules = await fetchCallingRules('https://lcr.example.org', (url) => {
      calls.push(url)
      return Promise.resolve(new Response(payload))
    }, 'spa')
    assert.deepEqual(calls, [`https://lcr.example.org${ORGANIZATIONS_PATH}?lang=spa&_rsc`])
    assert.equal(rules.size, 2)
  })

  it('otherwise calls the action the page loads them with, the way the page does', async () => {
    const calls: { url: string, init: RequestInit }[] = []
    const rules = await fetchCallingRules('https://lcr.example.org', (url, init) => {
      calls.push({ url, init })
      if (url.endsWith(CHUNK)) return Promise.resolve(new Response(`(0,r.createServerReference)("${ACTION_ID}",r.callServer,void 0,r.findSourceMapURL,"getUnitOrgs")`))
      if (init.method === 'POST') return Promise.resolve(new Response(payload))
      return Promise.resolve(new Response(`0:{"f":[]}\n1:I[1,["${CHUNK}"],"OrgsProvider"]\n`))
    })
    assert.equal(rules.size, 2)
    assert.deepEqual(calls.at(-1), {
      url: `https://lcr.example.org${ORGANIZATIONS_PATH}?lang=eng`,
      init: {
        method: 'POST',
        headers: { 'Accept': 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8', 'Next-Action': ACTION_ID },
        body: '["eng"]',
        redirect: 'manual',
      },
    })
  })

  it('reports a page with no callings, rather than listing everyone for every calling', async () => {
    await assert.rejects(fetchCallingRules('https://lcr.example.org', () => Promise.resolve(new Response('0:{}\n'))), /Couldn't find how/)
  })
})
