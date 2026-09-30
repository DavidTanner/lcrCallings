import * as esbuild from 'esbuild'
import getPort from 'get-port'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, rm } from 'node:fs/promises'

// Builds web/, a page for people who can't install the extension (e.g. on an
// iPad), into public/ for GitHub Pages. `--serve` serves it on 127.0.0.1
// instead, rebuilding on each page load.
const serve = process.argv.includes('--serve')
const outdir = 'public'

// WEB_OAUTH_CLIENT_ID (and optionally SPREADSHEET_ID) can live in .env
// (git-ignored), or come from CI variables
if (existsSync('.env')) process.loadEnvFile('.env')
const { WEB_OAUTH_CLIENT_ID: clientId = '', SPREADSHEET_ID: spreadsheetId = '' } = process.env
if (!clientId) console.warn('WEB_OAUTH_CLIENT_ID is not set, so Google sign-in won\'t work. See README.md.')

const options: esbuild.BuildOptions = {
  entryPoints: ['web/main.tsx'],
  outfile: `${outdir}/app.js`,
  bundle: true,
  platform: 'browser',
  // iPads that can't update past iPadOS 16
  target: ['safari16', 'chrome120'],
  format: 'iife',
  jsx: 'automatic',
  loader: { '.css': 'text' },
  minify: !serve,
  sourcemap: serve ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(serve ? 'development' : 'production'),
    'process.env.WEB_OAUTH_CLIENT_ID': JSON.stringify(clientId),
    'process.env.SPREADSHEET_ID': JSON.stringify(spreadsheetId),
  },
}

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir)
await copyFile('web/index.html', `${outdir}/index.html`)
await copyFile('icons/icon-128.png', `${outdir}/icon-128.png`)

if (serve) {
  const host = '127.0.0.1'
  const port = await getPort({ port: 8002 })
  const ctx = await esbuild.context({ ...options, write: false })
  await ctx.serve({ servedir: outdir, host, port })
  console.log(`Web page running at http://${host}:${String(port)}/ (add it to the OAuth client's JavaScript origins to sign in)`)
}
else {
  await esbuild.build(options)
  console.log(`Built ${outdir}/. Host it on GitHub Pages (see .github/workflows/ci.yml) or any static host.`)
}
