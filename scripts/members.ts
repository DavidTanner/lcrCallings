// Prints the members in a saved LCR page payload as JSON:
//   npm run members -- [path]
import { readFile } from 'node:fs/promises'
import { parseMembers } from '../src/lcr/members'

const path = process.argv[2] ?? 'resources/mltRecordsMemberList.txt'
console.log(JSON.stringify(parseMembers(await readFile(path, 'utf8')), null, 2))
