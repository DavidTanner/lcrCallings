import { message } from '../shared/errors'
import type { BackgroundRequest, BackgroundResponses, Result, ToggleMessage } from '../shared/messages'
import { createSheetsClient, SheetsError } from './sheets'

const sheets = createSheetsClient({
  async get() {
    const { token } = await chrome.identity.getAuthToken({ interactive: true })
    if (!token) throw new Error('Google sign-in was cancelled')
    return token
  },
  invalidate: token => chrome.identity.removeCachedAuthToken({ token }),
})

async function handle(request: BackgroundRequest): Promise<BackgroundResponses[BackgroundRequest['type']]> {
  switch (request.type) {
    case 'load':
      return sheets.load(request.spreadsheetId)
    case 'save':
      return sheets.save(request.spreadsheetId, request.consideration)
    case 'sync':
      return sheets.sync(request.spreadsheetId, request.considerations)
    case 'saveMembers':
      await sheets.saveMembers(request.spreadsheetId, request.members)
      return null
  }
}

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse: (result: Result<unknown>) => void) => {
  handle(request).then(
    (data) => {
      sendResponse({ ok: true, data })
    },
    (error: unknown) => {
      sendResponse({
        ok: false,
        error: message(error),
        ...(error instanceof SheetsError ? { status: error.status } : {}),
      })
    },
  )
  return true // respond asynchronously
})

// The toolbar button opens and closes the panel on the current tab
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return
  const tabId = tab.id
  const toggle: ToggleMessage = { type: 'toggle' }
  chrome.tabs.sendMessage(tabId, toggle).catch(async () => {
    // tabs opened before the extension was installed or reloaded don't have
    // the content script yet; this fails on pages it isn't allowed on
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    await chrome.tabs.sendMessage(tabId, toggle)
  }).catch(() => undefined)
})
