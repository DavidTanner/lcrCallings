import * as esbuild from 'esbuild'

// Builds notify/, an Apps Script that emails who's at Schedule for Interview,
// into one file to paste into the sheet's Extensions → Apps Script (see
// README.md). Apps Script only runs and schedules top-level functions, so
// each one it calls gets a stub that calls into the bundle.
const outfile = 'build/notify.js'
const handlers = ['setup', 'sendInterviewEmails']

await esbuild.build({
  entryPoints: ['notify/index.ts'],
  outfile,
  bundle: true,
  platform: 'neutral',
  target: 'es2019',
  format: 'iife',
  globalName: 'notify',
  legalComments: 'none',
  logLevel: 'info',
  banner: { js: '// LCR Callings: emails who is at Schedule for Interview. Built from notify/index.ts; run setup once.' },
  footer: { js: handlers.map(name => `function ${name}() { notify.${name}() }`).join('\n') },
})
console.log(`Built ${outfile}. Paste it into the sheet's Extensions → Apps Script and run setup (see README.md).`)
