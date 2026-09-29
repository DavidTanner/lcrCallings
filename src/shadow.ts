const sheets = new WeakMap<Document, CSSStyleSheet>()

/** Adds `css` to a shadow root, sharing one stylesheet between roots where the browser supports it */
export function addStyles(root: ShadowRoot, css: string) {
  const doc = root.ownerDocument
  const view = doc.defaultView
  if (view && 'adoptedStyleSheets' in root) {
    let sheet = sheets.get(doc)
    if (!sheet) {
      sheet = new view.CSSStyleSheet()
      sheet.replaceSync(css)
      sheets.set(doc, sheet)
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  }
  else {
    const style = doc.createElement('style')
    style.textContent = css
    root.append(style)
  }
}

const containers = new WeakMap<Element, HTMLElement>()

/**
 * The element to render into inside `host`'s shadow root, attaching and
 * styling the root the first time
 */
export function shadowContainer(host: HTMLElement, css: string): HTMLElement {
  let container = containers.get(host)
  if (!container) {
    const root = host.attachShadow({ mode: 'open' })
    addStyles(root, css)
    container = host.ownerDocument.createElement('div')
    root.append(container)
    containers.set(host, container)
  }
  return container
}
