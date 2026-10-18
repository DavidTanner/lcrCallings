import * as esbuild from 'esbuild'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, rm } from 'node:fs/promises'

// Builds web/, a page for people who can't install the extension (e.g. on an
// iPad), into public/app/ for GitHub Pages, after site:build (which empties
// public/). `--serve` serves it on 127.0.0.1 instead, rebuilding on each page
// load.
const serve = process.argv.includes('--serve')
const outdir = 'public/app'

// WEB_OAUTH_CLIENT_ID, PICKER_API_KEY (and optionally SPREADSHEET_ID) can
// live in .env (git-ignored), or come from CI variables
if (existsSync('.env')) process.loadEnvFile('.env')
const { WEB_OAUTH_CLIENT_ID: clientId = '', PICKER_API_KEY: pickerApiKey = '', SPREADSHEET_ID: spreadsheetId = '' } = process.env
if (!clientId) console.warn('WEB_OAUTH_CLIENT_ID is not set, so Google sign-in won\'t work. See README.md.')
if (!pickerApiKey) console.warn('PICKER_API_KEY is not set, so Google\'s file picker may not open. See README.md.')

const options: esbuild.BuildOptions = {
  // pick.js is for pick.html, which shows Google's file picker for the
  // extension (see src/shared/picker.ts)
  entryPoints: { app: 'web/main.tsx', pick: 'web/pickMain.ts' },
  outdir,
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
    'process.env.PICKER_API_KEY': JSON.stringify(pickerApiKey),
  },
}

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir, { recursive: true })
await copyFile('web/index.html', `${outdir}/index.html`)
await copyFile('web/pick.html', `${outdir}/pick.html`)
await copyFile('icons/icon-128.png', `${outdir}/icon-128.png`)

if (serve) {
  const host = '127.0.0.1'
  const ctx = await esbuild.context({ ...options, write: false })
  await ctx.serve({ servedir: outdir, host, port: 8002 })
  console.log(`Web page running at http://${host}:8002/ (add it to the OAuth client's JavaScript origins to sign in)`)
}
else {
  await esbuild.build(options)
  console.log(`Built ${outdir}/. Host it on GitHub Pages (see .github/workflows/deploy.yml) or any static host.`)
}
