/** Accepts a Google Sheets URL or a bare spreadsheet id */
export function parseSpreadsheetId(input: string): string | undefined {
  const text = input.trim()
  const fromUrl = /\/spreadsheets\/d\/([\w-]+)/.exec(text)?.[1]
  if (fromUrl) return fromUrl
  return /^[\w-]{20,}$/.test(text) ? text : undefined
}

export const spreadsheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`

/** A link to the web page at `pageUrl` that opens the sheet, for people without the extension */
export function webPageLink(pageUrl: string, spreadsheetId: string) {
  const url = new URL(pageUrl)
  url.searchParams.set('sheet', spreadsheetId)
  url.hash = ''
  return url.href
}
