import * as esbuild from 'esbuild'
import getPort from 'get-port'

// Serves demo/, a mock Organizations page running the panel against a
// pretend sheet and made-up members, so the extension can be shown without
// Chrome, Google sign-in or real member data. Rebuilds on each page load.
const host = '127.0.0.1'
const port = await getPort({ port: 8001 })

const ctx = await esbuild.context({
  entryPoints: ['demo/main.ts'],
  outfile: 'demo/demo.js',
  // served from memory, so nothing is written to demo/
  write: false,
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  jsx: 'automatic',
  loader: { '.css': 'text' },
  sourcemap: 'inline',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
})

await ctx.serve({ servedir: 'demo', host, port })
console.log(`Demo running at http://${host}:${String(port)}/`)
