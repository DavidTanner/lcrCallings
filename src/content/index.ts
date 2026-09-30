import type { ToggleMessage } from '../shared/messages'
import { HOST_ID } from '../constants'
import { mount, type Unmount } from '../mount'
import { chromeApi } from './api'

// set when building, from the environment (see scripts/build.ts)
const WEB_URL = process.env.WEB_URL || undefined

declare global {
  var callingsContentScript: boolean | undefined
}

// The background injects this script into tabs opened before the extension
// was installed; don't listen twice if it's somehow already here
if (!globalThis.callingsContentScript) {
  globalThis.callingsContentScript = true
  let unmount: Unmount | undefined

  chrome.runtime.onMessage.addListener((message: Partial<ToggleMessage>) => {
    if (message.type !== 'toggle') return
    // the host is already gone if the panel was closed from its own button
    if (unmount && document.getElementById(HOST_ID)) {
      unmount()
      unmount = undefined
    }
    else {
      unmount = mount(document, chromeApi, WEB_URL)
    }
  })
}
