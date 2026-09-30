// Writes the demo ward to demo/sheet/ as CSV files, one per tab, to import
// into a Google Sheet for trying the web page:
//   npm run demo:sheet
import { mkdir, writeFile } from 'node:fs/promises'
import { demoSheetCsv } from '../demo/sheet'

const dir = 'demo/sheet'
await mkdir(dir, { recursive: true })
for (const [name, content] of Object.entries(demoSheetCsv())) {
  await writeFile(`${dir}/${name}`, content)
  console.log(`Wrote ${dir}/${name}`)
}
