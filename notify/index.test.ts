import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { HEADER, MEMBERS_HEADER, MEMBERS_TITLE, SHEET_TITLE } from '../src/background/sheets'
import { type Email, interviewEmail, recipients, sendInterviewEmails, SETTINGS_HEADER, SETTINGS_TITLE, setup, STATUS } from './index'

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/sheet1/edit'
const ANN = '11111111-1111-1111-1111-111111111111'
const BOB = '22222222-2222-2222-2222-222222222222'

/** A Considering row with these candidates in Data */
const row = (key: string, calling: string, candidates: object[], organization = '', position = '') =>
  [key, calling, '', '', '', '', JSON.stringify(candidates), '', organization, position]

const members = [MEMBERS_HEADER, [ANN, 'Avery, Ann'], [BOB, 'Baker, Bob']]

describe('recipients', () => {
  it('lists the addresses for Schedule for Interview only, keeping names with them', () => {
    assert.deepEqual(recipients([
      SETTINGS_HEADER,
      [STATUS, 'a@example.com, b@example.com'],
      ['Sustained', 'c@example.com'],
      [` ${STATUS} `, 'Bishop Smith <bishop@example.org>;'],
      [STATUS, ''],
    ]), ['a@example.com', 'b@example.com', 'Bishop Smith <bishop@example.org>'])
  })
})

describe('interviewEmail', () => {
  it('lists everyone at Schedule for Interview in page order, with calling, organization and notes', () => {
    const email = interviewEmail([
      HEADER,
      row('organist', 'Organist', [{ id: BOB, notes: 'Plays piano.\nAsk first', status: STATUS }], 'Music', '29'),
      row('clerk', 'Ward Clerk', [{ id: ANN, notes: '', status: STATUS }, { id: BOB, notes: '', status: 'Discussion' }], 'Bishopric', '5'),
      row('teacher', 'Teacher', [{ id: 'text:Cy Doe', notes: '', status: STATUS }]),
    ], members, SHEET_URL)
    assert.deepEqual(email, {
      subject: `${STATUS}: 3 members`,
      body: [
        `At ${STATUS}:`,
        '',
        '- Avery, Ann: Ward Clerk (Bishopric)',
        '- Baker, Bob: Organist (Music)',
        '  Plays piano.',
        '  Ask first',
        '- Cy Doe: Teacher',
        '',
        SHEET_URL,
      ].join('\n'),
    })
  })

  it('uses the last row for a key, as the extension does', () => {
    const email = interviewEmail([
      HEADER,
      row('clerk', 'Ward Clerk', [{ id: ANN, notes: '', status: STATUS }]),
      row('clerk', 'Ward Clerk', [{ id: ANN, notes: '', status: 'Discussion' }]),
    ], members, SHEET_URL)
    assert.equal(email, undefined)
  })

  it('is none when nobody is at Schedule for Interview', () => {
    assert.equal(interviewEmail([HEADER, row('clerk', 'Ward Clerk', [{ id: ANN, notes: '' }])], members, SHEET_URL), undefined)
    assert.equal(interviewEmail([], [], SHEET_URL), undefined)
  })
})

describe('Apps Script', () => {
  /** Puts fake Apps Script services on globalThis, with these tabs, and records what they're asked to do */
  function fakeAppsScript(tabs: Record<string, string[][]>, triggers: string[] = []) {
    const sent: Email[] = []
    const scheduled: { handler: string, day: unknown, hour?: number, minute?: number }[] = []
    const sheet = (title: string) => ({
      getDataRange: () => ({ getDisplayValues: () => tabs[title] ?? [] }),
      appendRow(values: string[]) {
        (tabs[title] ??= []).push(values)
        return this
      },
    })
    Object.assign(globalThis, {
      SpreadsheetApp: { getActiveSpreadsheet: () => ({
        getSheetByName: (title: string) => title in tabs ? sheet(title) : null,
        insertSheet: (title: string) => {
          tabs[title] = []
          return sheet(title)
        },
        getUrl: () => SHEET_URL,
      }) },
      MailApp: { sendEmail: (email: Email) => sent.push(email) },
      ScriptApp: {
        WeekDay: { TUESDAY: 'tue', FRIDAY: 'fri' },
        getProjectTriggers: () => triggers.map(handler => ({ getHandlerFunction: () => handler })),
        deleteTrigger: (trigger: { getHandlerFunction(): string }) => triggers.splice(triggers.indexOf(trigger.getHandlerFunction()), 1),
        newTrigger: (handler: string) => ({ timeBased: () => ({ onWeekDay(day: unknown) {
          const entry: (typeof scheduled)[number] = { handler, day }
          scheduled.push(entry)
          const builder = {
            atHour(hour: number) {
              entry.hour = hour
              return builder
            },
            nearMinute(minute: number) {
              entry.minute = minute
              return builder
            },
            create: () => undefined,
          }
          return builder
        } }) }),
      },
    })
    return { tabs, sent, scheduled, triggers }
  }

  afterEach(() => {
    for (const name of ['SpreadsheetApp', 'MailApp', 'ScriptApp']) Reflect.deleteProperty(globalThis, name)
  })

  it('setup adds the Settings tab and schedules Tuesday and Friday at 5pm, replacing the old schedule', () => {
    const apps = fakeAppsScript({}, ['sendInterviewEmails', 'other'])
    setup()
    assert.deepEqual(apps.tabs[SETTINGS_TITLE], [SETTINGS_HEADER, [STATUS, '']])
    assert.deepEqual(apps.triggers, ['other'])
    assert.deepEqual(apps.scheduled, [
      { handler: 'sendInterviewEmails', day: 'tue', hour: 17, minute: 0 },
      { handler: 'sendInterviewEmails', day: 'fri', hour: 17, minute: 0 },
    ])
  })

  it('setup leaves a Settings tab that is already there', () => {
    const settings = [SETTINGS_HEADER, [STATUS, 'a@example.com']]
    const apps = fakeAppsScript({ [SETTINGS_TITLE]: settings })
    setup()
    assert.deepEqual(apps.tabs[SETTINGS_TITLE], settings)
  })

  it('sends one email with everyone to the Settings tab\'s addresses', () => {
    const apps = fakeAppsScript({
      [SHEET_TITLE]: [HEADER, row('clerk', 'Ward Clerk', [{ id: ANN, notes: '', status: STATUS }, { id: BOB, notes: '', status: STATUS }])],
      [MEMBERS_TITLE]: members,
      [SETTINGS_TITLE]: [SETTINGS_HEADER, [STATUS, 'a@example.com, b@example.com']],
    })
    sendInterviewEmails()
    assert.deepEqual(apps.sent.map(({ to, subject }) => ({ to, subject })), [{ to: 'a@example.com,b@example.com', subject: `${STATUS}: 2 members` }])
  })

  it('fails, rather than sending to nobody, when the Settings tab has no address', () => {
    const apps = fakeAppsScript({ [SHEET_TITLE]: [HEADER, row('clerk', 'Ward Clerk', [{ id: ANN, notes: '', status: STATUS }])] })
    assert.throws(sendInterviewEmails, /Settings tab/)
    assert.deepEqual(apps.sent, [])
  })
})
