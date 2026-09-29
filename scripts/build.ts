import * as esbuild from 'esbuild'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { buildManifest } from './manifest'

const watch = process.argv.includes('--watch')
const outdir = 'dist'
const devServer = 'http://127.0.0.1:8000/'
/** A saved LCR page to try the extension on in dev. It holds member data, so it's git-ignored. */
const demoPage = 'resources/existingCallingsPage.html'
/** Saved LCR payloads the dev server answers requests with, by path (see src/lcr/memberList.ts) */
const devPayloads = {
  'mlt/records/member-list': 'resources/mltRecordsMemberList.txt',
}

// OAUTH_CLIENT_ID and EXTENSION_KEY can live in .env (git-ignored)
if (existsSync('.env')) process.loadEnvFile('.env')
const { OAUTH_CLIENT_ID: clientId, EXTENSION_KEY: key } = process.env
if (!clientId) console.warn('OAUTH_CLIENT_ID is not set, so Google sign-in won\'t work. See README.md.')

const common: esbuild.BuildOptions = {
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
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
const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { version: string, description: string }
const manifest = buildManifest({ version: pkg.version, description: pkg.description, clientId, key, dev: watch })
await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2))

if (watch) {
  const contexts = await Promise.all(builds.map(options => esbuild.context(options)))
  await Promise.all(contexts.map(ctx => ctx.watch()))
  if (existsSync(demoPage)) await writeFile(`${outdir}/demo.html`, await readFile(demoPage))
  for (const [path, source] of Object.entries(devPayloads)) {
    if (!existsSync(source)) continue
    await mkdir(dirname(`${outdir}/${path}`), { recursive: true })
    await writeFile(`${outdir}/${path}`, await readFile(source))
  }
  await contexts[0]?.serve({ servedir: outdir, host: '127.0.0.1', port: 8000 })
  console.log(`Load ${outdir}/ as an unpacked extension, then open ${devServer}demo.html`)
  console.log('Reload the extension in chrome://extensions after changes.')
}
else {
  await Promise.all(builds.map(options => esbuild.build(options)))
  console.log(`Built ${outdir}/. Load it as an unpacked extension, or zip it for the Chrome Web Store.`)
}
