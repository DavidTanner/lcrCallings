import { message } from '../src/shared/errors'
import type { PickReady, PickRequest, PickResult } from '../src/shared/picker'
import { type Picker, pickSpreadsheet, projectNumber } from './picker'

export interface AnswerPicksOptions {
  /** pick.html's window, framed by the extension's picker.html */
  win: Window
  /** the web page's OAuth client id, which starts with the project's number */
  clientId: string
  apiKey?: string
  /** `google.picker`, loaded the first time it's needed */
  load: () => Promise<Picker>
}

/**
 * The origin of the page at the top of the frames, e.g. LCR's: the picker
 * insists on being told it (`setOrigin`), not the origin of the frame it's in.
 * Chrome lists the frames' origins in `ancestorOrigins`, nearest first.
 */
export function topOrigin(location: Location): string {
  const ancestors = location.ancestorOrigins as DOMStringList | undefined
  return ancestors?.item(ancestors.length - 1) ?? location.origin
}

/**
 * pick.html: shows Google's file picker for the extension, which frames this
 * page over LCR and hands it its own token (see src/shared/picker.ts), and
 * answers with the sheet chosen. Access is granted to the Google Cloud
 * project, so the extension can open the sheet too. Returns false if the page
 * isn't framed, so has no one to answer.
 */
export function answerPicks({ win, clientId, apiKey, load }: AnswerPicksOptions): boolean {
  const parent = win.parent
  if (parent === win) return false

  win.addEventListener('message', (event: MessageEvent) => {
    // only the extension hands over tokens; any other frame is ignored
    if (event.source !== parent || !event.origin.startsWith('chrome-extension://')) return
    const request = event.data as Partial<PickRequest> | null
    if (request?.type !== 'callings-pick' || typeof request.token !== 'string') return
    const { token, spreadsheetId } = request
    const reply = (result: PickResult) => {
      parent.postMessage(result, event.origin)
    }
    void (async () => {
      try {
        const appId = projectNumber(clientId)
        if (!appId) throw new Error('The web page was built without WEB_OAUTH_CLIENT_ID, so it can\'t show Google\'s file picker.')
        const picked = pickSpreadsheet(await load(), { token, appId, apiKey, origin: topOrigin(win.location), spreadsheetId })
        reply({ type: 'callings-pick-shown' })
        reply({ type: 'callings-picked', spreadsheetId: await picked })
      }
      catch (error) {
        reply({ type: 'callings-pick-failed', error: message(error) })
      }
    })()
  })

  // nothing secret, and the extension checks where it came from
  const ready: PickReady = { type: 'callings-pick-ready' }
  parent.postMessage(ready, '*')
  return true
}
