import { localStorageColorSchemeManager, MantineProvider, Portal } from '@mantine/core'
import mantineCss from '@mantine/core/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { HOST_ID } from './constants'
import type { ExtensionApi } from './content/api'
import { addStyles } from './shadow'

export type Unmount = () => void

/**
 * Renders the panel inside a shadow root attached to a fixed-position host
 * element, so the host page's CSS can't leak in and Mantine's can't leak out.
 */
export function mount(doc: Document, api: ExtensionApi): Unmount {
  const host = doc.createElement('div')
  host.id = HOST_ID
  Object.assign(host.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: '2147483647',
  })

  const shadow = host.attachShadow({ mode: 'open' })

  addStyles(shadow, mantineCss)

  const container = doc.createElement('div')
  shadow.append(container)

  // Mantine portals (menus, popovers, modals) must render inside the shadow
  // root too, otherwise they'd be unstyled
  const portalTarget = doc.createElement('div')
  shadow.append(portalTarget)

  doc.body.append(host)

  const root = createRoot(container)
  const unmount = () => {
    root.unmount()
    host.remove()
  }

  root.render(
    <StrictMode>
      <MantineProvider
        cssVariablesSelector=":host"
        getRootElement={() => host}
        colorSchemeManager={localStorageColorSchemeManager({ key: `${HOST_ID}-color-scheme` })}
        defaultColorScheme="auto"
        theme={{
          components: {
            Portal: Portal.extend({ defaultProps: { target: portalTarget } }),
          },
        }}
      >
        <App doc={doc} api={api} onClose={unmount} />
      </MantineProvider>
    </StrictMode>,
  )

  return unmount
}
