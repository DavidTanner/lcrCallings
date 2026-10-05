import { marked } from 'marked'
import { readFile } from 'node:fs/promises'
import { APP_NAME } from '../src/constants.ts'

/** Where the site is published (GitHub Pages, with a custom domain) */
export const SITE_URL = 'https://lcrcallings.click/'

/** The legal pages, each published at /<path>/ from a Markdown file in the repo */
export const LEGAL_PAGES = [
  { path: 'privacy', file: 'PRIVACY.md', title: 'Privacy Policy' },
  { path: 'terms', file: 'TOS.md', title: 'Terms of Service' },
  { path: 'disclaimer', file: 'DISCLAIMER.md', title: 'Disclaimer' },
] as const

const escape = (text: string) => text.replace(/[&<>"]/g, c => `&#${String(c.charCodeAt(0))};`)

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match)

/** `content` in the site's header and footer, which link to the legal pages */
export async function renderPage({ title, description, content }: { title: string, description: string, content: string }) {
  const layout = await readFile('site/layout.html', 'utf8')
  return fill(layout, { title: escape(title), description: escape(description), content, appName: APP_NAME })
}

/** The home page: what the app is for, without signing in, and links to the legal pages */
export async function renderHome({ storeUrl }: { storeUrl?: string } = {}) {
  const storeLink = storeUrl ? `<a class="button" href="${escape(storeUrl)}">Add to Chrome</a>` : ''
  const content = fill(await readFile('site/home.html', 'utf8'), { appName: APP_NAME, storeLink })
  return renderPage({
    title: `${APP_NAME}: track callings being considered in LCR`,
    description: `${APP_NAME} tracks who is being considered for each calling on the Organizations page in Leader and Clerk Resources, in a shared Google Sheet.`,
    content,
  })
}

export async function renderLegalPage({ file, title }: (typeof LEGAL_PAGES)[number]) {
  const markdown = await readFile(file, 'utf8')
  return renderPage({ title: `${title} | ${APP_NAME}`, description: `${APP_NAME} ${title}`, content: await marked.parse(markdown) })
}
