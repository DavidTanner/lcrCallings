/**
 * Showing Google's file picker over LCR. Chrome extensions can't load the
 * picker's script, and LCR's Content-Security-Policy won't let its pages frame
 * the web page, but it can't stop a frame of the extension's own page. So the
 * content script frames the extension's `picker.html` over LCR, which frames
 * the web page's `pick.html`, which shows the picker:
 *
 *   LCR (content script) ⟶ picker.html (extension) ⟶ pick.html (web page) ⟶ Google's picker
 *
 * picker.html gives pick.html the extension's own token (`PickRequest`), so
 * there's no second sign-in, and passes what it answers (`PickResult`) back
 * up to the content script.
 */

/** The extension's page the content script frames, listed in web_accessible_resources */
export const PICKER_FRAME = 'picker.html'

/** pick.html → picker.html: ready for a `PickRequest` */
export interface PickReady { type: 'callings-pick-ready' }

/** picker.html → pick.html */
export interface PickRequest {
  type: 'callings-pick'
  /** the extension's Google token, for the drive.file scope */
  token: string
  /** opens the picker on just this sheet */
  spreadsheetId?: string
}

/** pick.html → picker.html → content script */
export type PickResult
  /** Google's picker is showing */
  = | { type: 'callings-pick-shown' }
    /** `spreadsheetId` is undefined if they cancelled */
    | { type: 'callings-picked', spreadsheetId?: string }
    | { type: 'callings-pick-failed', error: string }

export type PickMessage = PickReady | PickResult

const TYPES = new Set<unknown>(['callings-pick-ready', 'callings-pick-shown', 'callings-picked', 'callings-pick-failed'])

export const isPickMessage = (data: unknown): data is PickMessage =>
  typeof data === 'object' && data !== null && TYPES.has((data as { type?: unknown }).type)

/** The web page's pick.html, next to the page at `webUrl` (e.g. `https://lcrcallings.click/app/`) */
export function pickPageUrl(webUrl: string) {
  const url = new URL(webUrl)
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  url.search = ''
  url.hash = ''
  return new URL('pick.html', url).href
}
