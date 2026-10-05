import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { APP_NAME } from '../src/constants'
import { LEGAL_PAGES, renderHome, renderLegalPage } from './pages'

// Google won't approve the OAuth consent screen unless the home page names the
// app as the consent screen does, explains it without signing in, and links to
// the privacy policy
describe('renderHome', () => {
  it('names the app and links to the privacy policy, terms and web app', async () => {
    const html = await renderHome()
    assert.match(html, new RegExp(`<title>${APP_NAME}[:<]`))
    assert.match(html, new RegExp(`<h1>${APP_NAME}</h1>`))
    assert.match(html, /href="\/privacy\/"/)
    assert.match(html, /href="\/terms\/"/)
    assert.match(html, /href="\/app\/"/)
    assert.doesNotMatch(html, /\{\{\w+\}\}/)
    assert.doesNotMatch(html, /Add to Chrome/)
  })

  it('links to the Chrome Web Store when given the listing', async () => {
    const html = await renderHome({ storeUrl: 'https://chromewebstore.google.com/detail/abc' })
    assert.match(html, /<a class="button" href="https:\/\/chromewebstore.google.com\/detail\/abc">Add to Chrome<\/a>/)
  })
})

describe('renderLegalPage', () => {
  for (const page of LEGAL_PAGES) {
    it(`renders ${page.file}`, async () => {
      const html = await renderLegalPage(page)
      assert.match(html, new RegExp(`<title>${page.title} \\| ${APP_NAME}</title>`))
      assert.match(html, /<h1>/)
      assert.doesNotMatch(html, /\{\{\w+\}\}/)
    })
  }

  it('renders the privacy policy\'s Markdown as HTML', async () => {
    const html = await renderLegalPage(LEGAL_PAGES[0])
    assert.match(html, /<h1>Privacy Policy<\/h1>/)
    assert.match(html, /<h2>[^<]*Google[^<]*<\/h2>/)
  })
})
