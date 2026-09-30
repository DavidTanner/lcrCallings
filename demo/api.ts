import type { ExtensionApi } from '../src/content/api'
import type { Candidate } from '../src/shared/consideration'
import { MEMBERS, SEED_SHEET } from './data'

/** Stands in for the Google Sheet link; anything that looks like one is accepted */
export const DEMO_SPREADSHEET_ID = 'callings-demo-spreadsheet'

const SHEET_KEY = 'callings-demo-sheet'
const SPREADSHEET_ID_KEY = 'callings-demo-spreadsheet-id'

/** The part of `Storage` the demo uses */
export type DemoStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Keeps the demo working where the browser won't store anything, e.g. a private window */
export function memoryStorage(): DemoStorage {
  const items = new Map<string, string>()
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key),
  }
}

export interface DemoApiOptions {
  storage?: DemoStorage
  /** how long each call pretends to take, like the round trip to Google or LCR */
  delayMs?: number
}

/**
 * The extension's API with a pretend shared sheet kept in `storage`, starting
 * with a few callings already being considered, and made-up members. Nothing
 * leaves the browser.
 */
export function demoApi({ storage = memoryStorage(), delayMs = 400 }: DemoApiOptions = {}): ExtensionApi {
  const wait = <T>(value: T) => new Promise<T>((resolve) => {
    setTimeout(() => {
      resolve(value)
    }, delayMs)
  })

  const readSheet = (): Record<string, Candidate[]> => {
    const saved = storage.getItem(SHEET_KEY)
    return saved ? JSON.parse(saved) as Record<string, Candidate[]> : structuredClone(SEED_SHEET)
  }

  return {
    // starts connected, so the column shows straight away; "Change sheet" still works
    getSpreadsheetId: () => Promise.resolve(storage.getItem(SPREADSHEET_ID_KEY) ?? DEMO_SPREADSHEET_ID),
    setSpreadsheetId: (id) => {
      storage.setItem(SPREADSHEET_ID_KEY, id)
      return Promise.resolve()
    },
    load: () => wait(readSheet()),
    save: async (_id, { key, candidates }) => {
      await wait(null)
      const sheet = readSheet()
      // like the real sheet, the row stays when its candidates are cleared
      sheet[key] = candidates
      storage.setItem(SHEET_KEY, JSON.stringify(sheet))
    },
    sync: async (_id, considerations) => {
      await wait(null)
      const sheet = readSheet()
      const missing = considerations.filter(c => !(c.key in sheet))
      for (const { key, candidates } of missing) sheet[key] = candidates
      storage.setItem(SHEET_KEY, JSON.stringify(sheet))
      return missing.length
    },
    loadMembers: () => wait(MEMBERS),
  }
}

/** Puts the pretend sheet back the way it started */
export function resetDemo(storage: DemoStorage) {
  storage.removeItem(SHEET_KEY)
  storage.removeItem(SPREADSHEET_ID_KEY)
}
