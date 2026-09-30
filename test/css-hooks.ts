import type { LoadHook } from 'node:module'

// Mirrors esbuild's `text` loader for .css files (see scripts/build.ts)
export const load: LoadHook = async (url, context, nextLoad) => {
  if (!url.endsWith('.css')) return nextLoad(url, context)
  const { source } = await nextLoad(url, { ...context, format: 'module' })
  const css = typeof source === 'string' ? source : new TextDecoder().decode(source)
  return {
    format: 'module',
    source: `export default ${JSON.stringify(css)}`,
    shortCircuit: true,
  }
}
