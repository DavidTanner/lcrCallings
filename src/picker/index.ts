import { runPickerFrame } from './frame'

// set when building, from the environment (see scripts/build.ts)
const WEB_URL = process.env.WEB_URL || undefined

// The LCR page that framed this one; only it hears which sheet was chosen
const parentOrigin = location.ancestorOrigins.item(0)

void runPickerFrame({
  doc: document,
  webUrl: WEB_URL,
  spreadsheetId: new URLSearchParams(location.search).get('sheet') ?? undefined,
  async getToken() {
    const { token } = await chrome.identity.getAuthToken({ interactive: true })
    if (!token) throw new Error('Google sign-in was cancelled')
    return token
  },
  tell(result) {
    if (parentOrigin) parent.postMessage(result, parentOrigin)
  },
})
