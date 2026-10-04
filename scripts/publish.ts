// Uploads a zip of dist/ to the Chrome Web Store and submits it for review.
// .github/workflows/deploy.yml runs it; see "Releasing" in README.md.
//   npm run store:publish -- callings.zip
import { readFile } from 'node:fs/promises'
import { WebStore, type ServiceAccount } from './webstore.ts'

const zip = process.argv[2]
if (!zip) throw new Error('Usage: npm run store:publish -- <zip of dist/>')

const { CWS_SERVICE_ACCOUNT: account, CWS_PUBLISHER_ID: publisherId, CWS_EXTENSION_ID: extensionId } = process.env
if (!account || !publisherId || !extensionId) {
  throw new Error('CWS_SERVICE_ACCOUNT, CWS_PUBLISHER_ID and CWS_EXTENSION_ID must be set. See README.md.')
}

const store = await WebStore.signIn(JSON.parse(account) as ServiceAccount, { publisherId, extensionId })
const version = await store.upload(await readFile(zip))
console.log(`Uploaded ${zip}${version ? ` (version ${version})` : ''}`)
const { state, warningInfo } = await store.publish()
for (const { reason, description } of warningInfo?.warnings ?? []) console.warn(`Warning: ${reason ?? ''} ${description ?? ''}`)
console.log(`Submitted for review: ${state ?? 'no state returned'}`)
