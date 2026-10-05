import { existsSync } from 'node:fs'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { LEGAL_PAGES, renderHome, renderLegalPage } from './pages.ts'

// Builds the public site into public/: the home page, which says what the app
// is for without signing in (Google checks this before approving the OAuth
// consent screen), and the privacy policy, terms and disclaimer from their
// Markdown files. Empties public/, so run it before web:build and demo:build.
const outdir = 'public'

// CWS_EXTENSION_ID (optional) adds an "Add to Chrome" link to the store listing
if (existsSync('.env')) process.loadEnvFile('.env')
const { CWS_EXTENSION_ID: extensionId = '' } = process.env

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir)
await copyFile('icons/icon-128.png', `${outdir}/icon-128.png`)
await writeFile(`${outdir}/index.html`, await renderHome({
  storeUrl: extensionId ? `https://chromewebstore.google.com/detail/${extensionId}` : undefined,
}))
await Promise.all(LEGAL_PAGES.map(async (page) => {
  await mkdir(`${outdir}/${page.path}`)
  await writeFile(`${outdir}/${page.path}/index.html`, await renderLegalPage(page))
}))
console.log(`Built the site into ${outdir}/.`)
