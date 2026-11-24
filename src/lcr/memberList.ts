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

export async function lcrFetch(url: string, init: RequestInit, fetchFn: FetchFn): Promise<Response> {
  // an expired session redirects to the sign-in host, which a followed fetch hits as a CORS failure
  const response = await fetchFn(url, { ...init, redirect: 'manual' })
  if (response.type === 'opaqueredirect') {
    throw new Error('LCR wants you to sign in again. Reload the page, then try again.')
  }
  return response
}

/** What `fetchPageData` loads from one of LCR's pages */
export interface PageData<T> {
  path: string
  /** what it is, for errors, e.g. "member list" */
  what: string
  /** what it holds, for errors, e.g. "members" */
  items: string
  parse: (payload: string) => T
  isEmpty: (data: T) => boolean
  /** the read-only Server Action that loads it, from those the page's scripts can call */
  pick: (actions: ServerAction[]) => ServerAction | undefined
  /** what the page sends the action */
  args: unknown[]
}

/**
 * Loads data from one of LCR's Next.js pages. Must run on LCR itself (the
 * content script), since it relies on the LCR session cookie.
 *
 * It asks for the page's flight payload with the `RSC` header, the way LCR's
 * own client-side navigation does, and copes with LCR answering with the
 * page's HTML instead. Older builds of LCR's pages had their data in that
 * payload; newer ones load it afterwards with a Server Action, so if there
 * is none it finds that action in the page's scripts (its id changes with
 * every LCR release) and calls it the way the page does.
 */
export async function fetchPageData<T>(origin: string, fetchFn: FetchFn, lang: string, { path, what, items, parse, isEmpty, pick, args }: PageData<T>): Promise<T> {
  const url = new URL(path, origin)
  // the URL LCR links to itself, so a signed-in request isn't redirected to add it
  url.searchParams.set('lang', lang)
  // Next.js redirects (307) an RSC request without its cache-busting `_rsc`
  // param, which is empty for one with no router state headers
  const response = await lcrFetch(`${url.href}&_rsc`, { headers: { RSC: '1' } }, fetchFn)
  if (!response.ok) throw new Error(`LCR's ${what} failed to load (HTTP ${String(response.status)})`)

  const body = await response.text()
  const isHtml = /^\s*</.test(body) || (response.headers.get('content-type') ?? '').includes('text/html')
  const data = parse(isHtml ? flightFromHtml(body) : body)
  if (!isEmpty(data)) return data

  const actions = (await Promise.all(scriptUrls(body).map(async (script) => {
    const js = await lcrFetch(new URL(script, origin).href, {}, fetchFn)
    return js.ok ? serverActions(await js.text()) : []
  }))).flat()
  const action = pick(actions)
  if (!action) {
    const names = actions.map(a => a.name).join(', ') || 'none'
    throw new Error(`Couldn't find how LCR's ${what} loads its ${items} (actions found: ${names})`)
  }

  const result = await lcrFetch(url.href, {
    method: 'POST',
    headers: { 'Accept': 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8', 'Next-Action': action.id },
    body: JSON.stringify(args),
  }, fetchFn)
  if (!result.ok) throw new Error(`LCR's ${what} failed to load (${action.name}, HTTP ${String(result.status)})`)
  const loaded = parse(await result.text())
  if (isEmpty(loaded)) throw new Error(`Found no ${items} in LCR's ${what} (${path})`)
  return loaded
}

/** Everyone in the unit, sorted by name, from LCR's Member List page */
export function fetchMemberList(origin: string, fetchFn: FetchFn = fetch, lang = 'eng'): Promise<Member[]> {
  return fetchPageData(origin, fetchFn, lang, {
    path: MEMBER_LIST_PATH,
    what: 'member list',
    items: 'members',
    parse: parseMembers,
    isEmpty: members => !members.length,
    pick: memberListAction,
    args: ['$undefined', lang],
  })
}
