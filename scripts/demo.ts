import * as esbuild from 'esbuild'
import getPort from 'get-port'
import { copyFile, mkdir, rm } from 'node:fs/promises'

// Serves demo/, a mock Organizations page running the panel against a
// pretend sheet and made-up members, so the extension can be shown without
// Chrome, Google sign-in or real member data. Rebuilds on each page load.
// `--build` builds it into public/demo/ instead, to publish alongside the
// web page (run it after web:build, which empties public/).
const build = process.argv.includes('--build')
const outdir = 'public/demo'

const options: esbuild.BuildOptions = {
  entryPoints: ['demo/main.ts'],
  outfile: build ? `${outdir}/demo.js` : 'demo/demo.js',
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  jsx: 'automatic',
  loader: { '.css': 'text' },
  minify: build,
  sourcemap: build ? false : 'inline',
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(build ? 'production' : 'development') },
}

if (build) {
  await rm(outdir, { recursive: true, force: true })
  await mkdir(outdir, { recursive: true })
  await copyFile('demo/index.html', `${outdir}/index.html`)
  await esbuild.build(options)
  console.log(`Built ${outdir}/.`)
}
else {
  const host = '127.0.0.1'
  const port = await getPort({ port: 8001 })
  // served from memory, so nothing is written to demo/
  const ctx = await esbuild.context({ ...options, write: false })
  await ctx.serve({ servedir: 'demo', host, port })
  console.log(`Demo running at http://${host}:${String(port)}/`)
}
