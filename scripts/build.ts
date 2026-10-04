import * as esbuild from 'esbuild'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { buildManifest } from './manifest.ts'
import pkg from '../package.json'

const dev = process.argv.includes('--dev')

const outdir = 'dist'

// OAUTH_CLIENT_ID, EXTENSION_KEY and WEB_URL can live in .env (git-ignored)
if (existsSync('.env')) process.loadEnvFile('.env')
const { OAUTH_CLIENT_ID: clientId, EXTENSION_KEY: key, WEB_URL: webUrl = '' } = process.env
if (!clientId) console.warn('OAUTH_CLIENT_ID is not set, so Google sign-in won\'t work. See README.md.')
if (webUrl && !URL.canParse(webUrl)) throw new Error(`WEB_URL isn't a URL: ${webUrl}`)

const common: esbuild.BuildOptions = {
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.WEB_URL': JSON.stringify(webUrl),
  },
}

const builds: esbuild.BuildOptions[] = [
  {
    ...common,
    entryPoints: ['src/content/index.ts'],
    outfile: `${outdir}/content.js`,
    format: 'iife',
    jsx: 'automatic',
    loader: { '.css': 'text' },
  },
  {
    ...common,
    entryPoints: ['src/background/index.ts'],
    outfile: `${outdir}/background.js`,
    format: 'esm',
  },
]

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir)
const manifest = buildManifest({
  version: pkg.version,
  description: pkg.description,
  clientId,
  ...(dev ? { key, dev } : {}),
})
await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2))

await Promise.all(builds.map(options => esbuild.build(options)))
console.log(`Built ${outdir}/. Load it as an unpacked extension, or zip it for the Chrome Web Store.`)
