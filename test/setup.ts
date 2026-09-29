// Loaded before every test file (see the `test` script in package.json):
// gives node:test a browser-like DOM for React and Mantine
import 'global-jsdom/register'
import { register } from 'node:module'

register('./css-hooks.ts', import.meta.url)

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// APIs Mantine relies on that jsdom doesn't implement
window.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})

globalThis.ResizeObserver = class {
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}

// Textarea's autosize re-measures when fonts load
Object.defineProperty(document, 'fonts', {
  value: { addEventListener: () => undefined, removeEventListener: () => undefined },
})
