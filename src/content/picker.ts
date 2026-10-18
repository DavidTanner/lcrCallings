import { isPickMessage } from '../shared/picker'

/**
 * Covers the page with a frame of the extension's picker page (`frameUrl`),
 * which shows Google's file picker (see src/shared/picker.ts). Resolves with
 * the sheet chosen, or undefined if they cancelled; the frame is gone either way.
 */
export function showPicker(doc: Document, frameUrl: string, spreadsheetId?: string): Promise<string | undefined> {
  const url = new URL(frameUrl)
  if (spreadsheetId) url.searchParams.set('sheet', spreadsheetId)

  const frame = doc.createElement('iframe')
  frame.src = url.href
  frame.title = 'Choose a Google Sheet'
  Object.assign(frame.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    border: '0',
    // above the panel, which is added before it
    zIndex: '2147483647',
    background: 'transparent',
    colorScheme: 'normal',
  })

  // spelled out, since URL gives "null" for schemes it doesn't know, like chrome-extension: outside Chrome
  const origin = `${url.protocol}//${url.host}`
  const view = doc.defaultView
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== origin || !isPickMessage(event.data)) return
      const data = event.data
      if (data.type === 'callings-picked') {
        done()
        resolve(data.spreadsheetId)
      }
      else if (data.type === 'callings-pick-failed') {
        done()
        reject(new Error(data.error))
      }
    }
    const done = () => {
      view?.removeEventListener('message', onMessage)
      frame.remove()
    }
    view?.addEventListener('message', onMessage)
    doc.body.append(frame)
  })
}
