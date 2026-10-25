import { APP_NAME } from '../constants'
import { message } from '../shared/errors'
import { isPickMessage, pickPageUrl, type PickRequest, type PickResult } from '../shared/picker'

/** How long pick.html gets to load and say it's ready, once there's a token */
export const READY_TIMEOUT_MS = 10_000
/** How long it then gets to load Google's picker and show it */
export const SHOW_TIMEOUT_MS = 30_000

export interface PickerFrameOptions {
  /** picker.html */
  doc: Document
  /** where the web page is; pick.html is next to it */
  webUrl?: string
  /** the extension's Google token */
  getToken: () => Promise<string>
  /** opens the picker on just this sheet */
  spreadsheetId?: string
  /** passes the answer up to the content script */
  tell: (result: PickResult) => void
  readyTimeoutMs?: number
  showTimeoutMs?: number
}

/**
 * The extension's page between LCR and the web page's pick.html (see
 * src/shared/picker.ts): frames pick.html, hands it the extension's token,
 * and passes back what it answers. Shows a Cancel button until the picker is up.
 */
export async function runPickerFrame({ doc, webUrl, getToken, spreadsheetId, tell, readyTimeoutMs = READY_TIMEOUT_MS, showTimeoutMs = SHOW_TIMEOUT_MS }: PickerFrameOptions) {
  // aborted once there's an answer, maybe while waiting for the token
  const finished = new AbortController()
  const finish = (result: PickResult) => {
    if (finished.signal.aborted) return
    finished.abort()
    tell(result)
  }
  const fail = (error: string) => {
    finish({ type: 'callings-pick-failed', error })
  }

  doc.getElementById('cancel')?.addEventListener('click', () => {
    finish({ type: 'callings-picked' })
  })

  if (!webUrl) {
    fail(`This copy of the extension doesn't know where the ${APP_NAME} web page is, so it can't show Google's file picker.`)
    return
  }

  let token: string
  try {
    token = await getToken()
  }
  catch (error) {
    fail(message(error))
    return
  }
  if (finished.signal.aborted) return

  const src = pickPageUrl(webUrl)
  const origin = new URL(src).origin
  const frame = doc.createElement('iframe')
  frame.id = 'pick'
  frame.src = src
  frame.title = 'Google file picker'

  let timer: ReturnType<typeof setTimeout> | undefined
  /** Fails with `error` unless the next step happens within `ms` */
  const expect = (ms: number, error: string) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      fail(error)
    }, ms)
  }

  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== origin || !isPickMessage(event.data)) return
    const data = event.data
    switch (data.type) {
      case 'callings-pick-ready': {
        const request: PickRequest = { type: 'callings-pick', token, ...(spreadsheetId ? { spreadsheetId } : {}) }
        frame.contentWindow?.postMessage(request, origin)
        expect(showTimeoutMs, 'Couldn\'t open Google\'s file picker. Check the connection and try again.')
        break
      }
      case 'callings-pick-shown':
        clearTimeout(timer)
        // Google's picker has its own backdrop
        doc.body.classList.add('shown')
        break
      default:
        finish(data)
    }
  }

  const view = doc.defaultView
  view?.addEventListener('message', onMessage)
  // the frame doesn't say if the page didn't load, e.g. the web page's server is down
  expect(readyTimeoutMs, `Couldn't reach the ${APP_NAME} web page at ${origin}, which shows Google's file picker.`)
  finished.signal.addEventListener('abort', () => {
    view?.removeEventListener('message', onMessage)
    clearTimeout(timer)
  })
  doc.body.append(frame)
}
