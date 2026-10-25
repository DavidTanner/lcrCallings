import { candidatesIn, MEMBERS_TITLE, ORGANIZATION_SEPARATOR, placementIn, SHEET_TITLE } from '../src/background/sheets'
import type { Status } from '../src/shared/consideration'

// An Apps Script for the sheet, built by `npm run notify:build` to paste into
// its Extensions → Apps Script. Each Tuesday and Friday at 5pm it emails the
// addresses the Settings tab lists everyone at Schedule for Interview. It
// runs in the Google account of whoever sets it up, not in the extension.

/** The only status emails go out for */
export const STATUS: Status = 'Schedule for Interview'

/** Title of the tab that says who's emailed for each status */
export const SETTINGS_TITLE = 'Settings'
export const SETTINGS_HEADER = ['Status', 'Email']

/** Apps Script runs time-based triggers within 15 minutes of this, in the script's time zone */
const DAYS = ['TUESDAY', 'FRIDAY'] as const
const HOUR = 17

export interface Email { to: string, subject: string, body: string }

interface Sheet {
  getDataRange(): { getDisplayValues(): string[][] }
  appendRow(row: string[]): Sheet
}

interface Trigger { getHandlerFunction(): string }

interface ClockTriggerBuilder {
  atHour(hour: number): ClockTriggerBuilder
  nearMinute(minute: number): ClockTriggerBuilder
  create(): Trigger
}

// The few Apps Script services used, which only exist there
declare const SpreadsheetApp: {
  getActiveSpreadsheet(): { getSheetByName(name: string): Sheet | null, insertSheet(name: string): Sheet, getUrl(): string }
}
declare const MailApp: { sendEmail(message: Email): void }
declare const ScriptApp: {
  WeekDay: Record<typeof DAYS[number], unknown>
  getProjectTriggers(): Trigger[]
  deleteTrigger(trigger: Trigger): void
  newTrigger(handler: string): { timeBased(): { onWeekDay(day: unknown): ClockTriggerBuilder } }
}

/**
 * The addresses the Settings tab's rows (Status | Email) list for `STATUS`.
 * A cell can hold several, separated by commas.
 */
export function recipients(settings: string[][]): string[] {
  return settings.flatMap(([status = '', email = '']) => status.trim() === STATUS ? email.split(/[,;]/).map(e => e.trim()).filter(Boolean) : [])
}

/**
 * The subject and body of an email listing everyone at `STATUS`, in the order
 * their callings are on the Organizations page, from the Considering and
 * Members tabs' rows; none if nobody is
 */
export function interviewEmail(rows: string[][], members: string[][], sheetUrl: string): Omit<Email, 'to'> | undefined {
  const names = new Map(members.map(([id = '', name = '']) => [id, name]))
  // the last row for a key wins, as in the extension
  const latest = new Map(rows.slice(1).flatMap(row => row[0] ? [[row[0], row] as const] : []))
  const lines = [...latest.values()]
    .map(row => ({ row, ...placementIn(row) }))
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
    .flatMap(({ row, organization }) => candidatesIn(row).filter(c => c.status === STATUS).map((c) => {
      const name = names.get(c.id) ?? (c.id.startsWith('text:') ? c.id.slice('text:'.length) : c.id)
      const where = organization ? ` (${organization.join(ORGANIZATION_SEPARATOR)})` : ''
      const notes = c.notes.trim() ? `\n  ${c.notes.trim().replaceAll('\n', '\n  ')}` : ''
      return `- ${name}: ${row[1] ?? ''}${where}${notes}`
    }))
  if (!lines.length) return undefined
  return {
    subject: `${STATUS}: ${String(lines.length)} ${lines.length === 1 ? 'member' : 'members'}`,
    body: [`At ${STATUS}:`, '', ...lines, '', sheetUrl].join('\n'),
  }
}

/**
 * Adds the Settings tab if it's missing and schedules the emails, replacing
 * any schedule from before. Run it once from the Apps Script editor.
 */
export function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  if (!spreadsheet.getSheetByName(SETTINGS_TITLE)) spreadsheet.insertSheet(SETTINGS_TITLE).appendRow(SETTINGS_HEADER).appendRow([STATUS, ''])
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'sendInterviewEmails') ScriptApp.deleteTrigger(trigger)
  }
  for (const day of DAYS) ScriptApp.newTrigger('sendInterviewEmails').timeBased().onWeekDay(ScriptApp.WeekDay[day]).atHour(HOUR).nearMinute(0).create()
}

/**
 * Emails everyone at `STATUS` to the Settings tab's addresses for it, unless
 * nobody is. Throws if there's no one to send it to, so Apps Script emails
 * whoever set it up that it failed.
 */
export function sendInterviewEmails() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  const values = (title: string) => spreadsheet.getSheetByName(title)?.getDataRange().getDisplayValues() ?? []
  const email = interviewEmail(values(SHEET_TITLE), values(MEMBERS_TITLE), spreadsheet.getUrl())
  if (!email) return
  const to = recipients(values(SETTINGS_TITLE))
  if (!to.length) throw new Error(`Add who to email in the ${SETTINGS_TITLE} tab, next to ${STATUS}`)
  MailApp.sendEmail({ to: to.join(','), ...email })
}
