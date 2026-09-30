import type { Candidate, Consideration } from './consideration'

/** Messages the content script sends the background service worker */
export type BackgroundRequest
  = | { type: 'load', spreadsheetId: string }
    | { type: 'save', spreadsheetId: string, consideration: Consideration }
    | { type: 'sync', spreadsheetId: string, considerations: Consideration[] }

export interface BackgroundResponses {
  /** key → who is being considered */
  load: Record<string, Candidate[]>
  save: null
  /** how many rows were added */
  sync: number
}

export type Result<T> = { ok: true, data: T } | { ok: false, error: string }

/** Message the background sends a tab when the toolbar button is clicked */
export interface ToggleMessage { type: 'toggle' }
