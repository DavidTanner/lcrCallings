import { type Member, parseMembers } from './members'

/** LCR's Member List page, which lists everyone in the unit */
export const MEMBER_LIST_PATH = '/mlt/records/member-list'

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>

/**
 * The flight payload a Next.js page embeds in its HTML, as a series of
 * `self.__next_f.push([1, "<chunk>"])` scripts. Joined, the chunks are what
 * the page would have sent for an `RSC` request.
 */
export function flightFromHtml(html: string): string {
  let payload = ''
  for (const [, args = ''] of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)\s*<\/script>/g)) {
    try {
      const [type, chunk]: unknown[] = JSON.parse(args) as unknown[]
      // 0 bootstraps, 1 is payload text, 2 is form state, 3 is binary
      if (type === 1 && typeof chunk === 'string') payload += chunk
    }
    catch { /* not a push we understand */ }
  }
  return payload
}

/** The JS chunks a page's payload or HTML loads */
export function scriptUrls(page: string): string[] {
  return [...new Set(page.match(/\/mlt\/_next\/static\/chunks\/[\w.-]+\.js/g))]
}

export interface ServerAction {
  id: string
  /** the name it's exported as in LCR's code */
  name: string
}

/**
 * The Next.js Server Actions a JS chunk can call, from the
 * `createServerReference("<id>", callServer, void 0, findSourceMapURL, "<name>")`
 * calls its bundler writes for them.
 */
export function serverActions(script: string): ServerAction[] {
  const actions: ServerAction[] = []
  for (const [, id = '', args = ''] of script.matchAll(/createServerReference\)?\(\s*["']([0-9a-f]{40,42})["']([^)]*)\)/g)) {
    const name = [...args.matchAll(/["']([\w$]+)["']/g)].at(-1)?.[1]
    if (name) actions.push({ id, name })
  }
  return actions
}

/**
 * The action the Member List page loads its members with. Only ever one that
 * reads members, e.g. `getMemberList`, never one that could change something.
 */
export function memberListAction(actions: ServerAction[]): ServerAction | undefined {
  const reads = actions.filter(a => /^(get|fetch|load|list|find|search)/i.test(a.name) && /member/i.test(a.name))
  const unique = [...new Map(reads.map(a => [a.id, a])).values()]
  // prefer one for the whole list over, say, one member's details
  return unique.find(a => /list|members/i.test(a.name)) ?? (unique.length === 1 ? unique[0] : undefined)
}

async function lcrFetch(url: string, init: RequestInit, fetchFn: FetchFn): Promise<Response> {
  const response = await fetchFn(url, {
    ...init,
  })
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    throw new Error('LCR wants you to sign in again. Reload the page, then try again.')
  }
  return response
}

/**
 * Everyone in the unit, sorted by name, from LCR's Member List page. Must run
 * on LCR itself (the content script), since it relies on the LCR session
 * cookie.
 *
 * It asks for the page's flight payload with the `RSC` header, the way LCR's
 * own client-side navigation does, and copes with LCR answering with the
 * page's HTML instead. Older builds of the page had the members in that
 * payload; newer ones load them afterwards with a Server Action, so if there
 * are none it finds that action in the page's scripts (its id changes with
 * every LCR release) and calls it the way the page does.
 */
export async function fetchMemberList(origin: string, fetchFn: FetchFn = fetch, lang = 'eng'): Promise<Member[]> {
  const url = new URL(MEMBER_LIST_PATH, origin)
  const response = await lcrFetch(url.href, { headers: { RSC: '1' } }, fetchFn)
  if (!response.ok) throw new Error(`LCR's member list failed to load (HTTP ${String(response.status)})`)

  const body = await response.text()
  const isHtml = /^\s*</.test(body) || (response.headers.get('content-type') ?? '').includes('text/html')
  const members = parseMembers(isHtml ? flightFromHtml(body) : body)
  if (members.length) return members

  const actions: ServerAction[] = []
  for (const script of scriptUrls(body)) {
    const js = await lcrFetch(new URL(script, origin).href, {}, fetchFn)
    if (js.ok) actions.push(...serverActions(await js.text()))
  }
  const action = memberListAction(actions)
  if (!action) {
    const names = actions.map(a => a.name).join(', ') || 'none'
    throw new Error(`Couldn't find how LCR's member list loads its members (actions found: ${names})`)
  }

  url.searchParams.set('lang', lang)
  const result = await lcrFetch(url.href, {
    method: 'POST',
    headers: { 'Accept': 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8', 'Next-Action': action.id },
    body: JSON.stringify(['$undefined', lang]),
  }, fetchFn)
  if (!result.ok) throw new Error(`LCR's member list failed to load (${action.name}, HTTP ${String(result.status)})`)
  const loaded = parseMembers(await result.text())
  if (!loaded.length) throw new Error(`Found no members in LCR's member list (${MEMBER_LIST_PATH})`)
  return loaded
}
