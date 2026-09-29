import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchMemberList, flightFromHtml, MEMBER_LIST_PATH, memberListAction, serverActions } from './memberList'

const ORIGIN = 'https://lcr.example.org'

const person = (uuid: string, name: string) => ({ uuid, name, nameSort: name.toUpperCase() })
const payload = `0:["$","div",null,{}]\n1:${JSON.stringify({ members: [person('u2', 'Zed, Ann'), person('u1', 'Abel, Bea')] })}\n`

/** How a Next.js page embeds its payload, split across scripts */
const html = (flight: string) => {
  const push = (args: unknown[]) => `<script>self.__next_f.push(${JSON.stringify(args)})</script>`
  const middle = flight.indexOf('1:')
  return `<!DOCTYPE html><html><body><div>Member List</div>`
    + `${push([0])}${push([1, flight.slice(0, middle)])}${push([1, flight.slice(middle)])}${push([2, null])}`
    + `</body></html>`
}

interface Call { url: string, init: RequestInit }

function fakeLcr(respond: (url: string, init: RequestInit) => Response) {
  const calls: Call[] = []
  const fetchFn = (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(respond(url, init))
  }
  return { calls, fetchFn }
}

describe('flightFromHtml', () => {
  it('joins the payload chunks a page embeds', () => {
    assert.equal(flightFromHtml(html(payload)), payload)
  })

  it('is empty for a page without any', () => {
    assert.equal(flightFromHtml('<html><script>console.log(1)</script></html>'), '')
  })
})

describe('fetchMemberList', () => {
  it('asks LCR for the member list page\'s payload, with the session cookie', async () => {
    const lcr = fakeLcr(() => new Response(payload, { headers: { 'content-type': 'text/x-component' } }))
    await fetchMemberList(ORIGIN, lcr.fetchFn)
    assert.deepEqual(lcr.calls, [{
      url: `${ORIGIN}${MEMBER_LIST_PATH}`,
      init: { headers: { RSC: '1' } },
    }])
  })

  it('returns the members, sorted by name', async () => {
    const lcr = fakeLcr(() => new Response(payload))
    const members = await fetchMemberList(ORIGIN, lcr.fetchFn)
    assert.deepEqual(members.map(m => m.name), ['Abel, Bea', 'Zed, Ann'])
  })

  it('reads members from the page\'s HTML when that is what comes back', async () => {
    const lcr = fakeLcr(() => new Response(html(payload), { headers: { 'content-type': 'text/html' } }))
    const members = await fetchMemberList(ORIGIN, lcr.fetchFn)
    assert.deepEqual(members.map(m => m.uuid), ['u1', 'u2'])
  })

  it('asks the user to sign in again when LCR redirects', async () => {
    const lcr = fakeLcr(() => new Response(null, { status: 302, headers: { location: 'https://id.example.org' } }))
    await assert.rejects(fetchMemberList(ORIGIN, lcr.fetchFn), /sign in again/)
  })

  it('reports HTTP errors', async () => {
    const lcr = fakeLcr(() => new Response('nope', { status: 500 }))
    await assert.rejects(fetchMemberList(ORIGIN, lcr.fetchFn), /HTTP 500/)
  })

  it('reports a page with no members and no way to load them', async () => {
    const lcr = fakeLcr(() => new Response('0:{}\n'))
    await assert.rejects(fetchMemberList(ORIGIN, lcr.fetchFn), /Couldn't find how/)
  })
})

const ACTION_ID = '609d9a84510c347dc4a89dcf47cc0e50b84ab5205f'
const reference = (id: string, name: string) =>
  `(0,r.createServerReference)("${id}",r.callServer,void 0,r.findSourceMapURL,"${name}")`
const CHUNK = '/mlt/_next/static/chunks/0abc-def.js'

/** How the Member List page works since members moved to a Server Action */
function actionLcr(script: string, result = payload) {
  const shell = `0:{"f":[]}\n1:I[1,["${CHUNK}"],"MemberListProvider"]\n`
  return fakeLcr((url, init) => {
    if (url.endsWith(CHUNK)) return new Response(script)
    if (init.method === 'POST') return new Response(result, { headers: { 'content-type': 'text/x-component' } })
    return new Response(shell)
  })
}

describe('serverActions', () => {
  it('finds the actions a chunk references, with their names', () => {
    const script = `let a=${reference(ACTION_ID, 'getMemberList')},b=${reference('40' + 'f'.repeat(40), 'updateMember')};`
    assert.deepEqual(serverActions(script), [
      { id: ACTION_ID, name: 'getMemberList' },
      { id: '40' + 'f'.repeat(40), name: 'updateMember' },
    ])
  })
})

describe('memberListAction', () => {
  it('picks the one that reads the member list', () => {
    const actions = [{ id: 'a', name: 'updateMember' }, { id: 'b', name: 'getMemberDetails' }, { id: 'c', name: 'getMemberList' }]
    assert.equal(memberListAction(actions)?.id, 'c')
  })

  it('never picks one that could change something', () => {
    assert.equal(memberListAction([{ id: 'a', name: 'saveMemberList' }, { id: 'b', name: 'deleteMembers' }]), undefined)
  })
})

describe('fetchMemberList, when the page loads members with a Server Action', () => {
  it('finds the action in the page\'s scripts and calls it the way the page does', async () => {
    const lcr = actionLcr(reference(ACTION_ID, 'getMemberList'))
    const members = await fetchMemberList(ORIGIN, lcr.fetchFn, 'spa')
    assert.deepEqual(members.map(m => m.uuid), ['u1', 'u2'])
    assert.deepEqual(lcr.calls.map(c => c.url), [`${ORIGIN}${MEMBER_LIST_PATH}`, `${ORIGIN}${CHUNK}`, `${ORIGIN}${MEMBER_LIST_PATH}?lang=spa`])
    assert.deepEqual(lcr.calls[2]?.init, {
      method: 'POST',
      headers: { 'Accept': 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8', 'Next-Action': ACTION_ID },
      body: '["$undefined","spa"]',
    })
  })

  it('says which actions it saw when none of them load members', async () => {
    const lcr = actionLcr(reference(ACTION_ID, 'printDirectory'))
    await assert.rejects(fetchMemberList(ORIGIN, lcr.fetchFn), /actions found: printDirectory/)
  })

  it('reports an action that returns no members', async () => {
    const lcr = actionLcr(reference(ACTION_ID, 'getMemberList'), '0:{}\n')
    await assert.rejects(fetchMemberList(ORIGIN, lcr.fetchFn), /Found no members/)
  })
})
