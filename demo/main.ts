import { HOST_ID } from '../src/constants'
import { mount, type Unmount } from '../src/mount'
import { demoApi, type DemoStorage, memoryStorage, resetDemo } from './api'
import { ORGANIZATIONS } from './data'
import { organizationsHtml } from './page'

function browserStorage(): DemoStorage {
  try {
    localStorage.setItem('callings-demo-check', '1')
    localStorage.removeItem('callings-demo-check')
    return localStorage
  }
  catch {
    return memoryStorage()
  }
}

const storage = browserStorage()
const api = demoApi({ storage })

const orgs = document.getElementById('orgs')
if (orgs) orgs.innerHTML = organizationsHtml(ORGANIZATIONS)

// The toolbar button opens and closes the panel, as in src/content/index.ts
let unmount: Unmount | undefined
const toggle = () => {
  // the host is already gone if the panel was closed from its own button
  if (unmount && document.getElementById(HOST_ID)) {
    unmount()
    unmount = undefined
  }
  else {
    unmount = mount(document, api)
  }
}

document.getElementById('demo-toggle')?.addEventListener('click', toggle)
document.getElementById('demo-reset')?.addEventListener('click', () => {
  resetDemo(storage)
  location.reload()
})

// ?open shows the panel straight away, e.g. for screenshots
if (new URLSearchParams(location.search).has('open')) toggle()
