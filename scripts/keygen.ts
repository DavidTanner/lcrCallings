// Pins the extension id by adding a public key to .env as EXTENSION_KEY, so
// the id stays the same wherever the unpacked extension is loaded. Google's
// OAuth client is tied to that id.
import { generateKeyPairSync } from 'node:crypto'
import { appendFile, readFile } from 'node:fs/promises'
import { extensionId } from './manifest'

const env = await readFile('.env', 'utf8').catch(() => '')
const existing = /^EXTENSION_KEY=(.+)$/m.exec(env)?.[1]
if (existing) {
  console.log(`.env already has EXTENSION_KEY. Extension id: ${extensionId(existing)}`)
}
else {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  await appendFile('.env', `${env && !env.endsWith('\n') ? '\n' : ''}EXTENSION_KEY=${key}\n`)
  console.log(`Added EXTENSION_KEY to .env. Extension id: ${extensionId(key)}`)
}
