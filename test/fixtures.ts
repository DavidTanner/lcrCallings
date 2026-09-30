import type { ExtensionApi } from '../src/content/api'
import type { Member } from '../src/lcr/members'
import type { Candidate, Consideration } from '../src/shared/consideration'

export const MEMBERS: Member[] = [
  { uuid: 'm1', name: 'Abel, Bea', nameSort: 'ABEL, BEA' },
  { uuid: 'm2', name: 'Baker, Cal', nameSort: 'BAKER, CAL' },
  { uuid: 'm3', name: 'Cole, Dee', nameSort: 'COLE, DEE' },
]

export interface FakeApiOptions {
  spreadsheetId?: string
  sheet?: Record<string, Candidate[]>
  members?: Member[]
}

/** An in-memory extension backed by a pretend spreadsheet */
export function fakeApi({ spreadsheetId, sheet = {}, members = MEMBERS }: FakeApiOptions = {}) {
  const saved: Consideration[] = []
  const synced: Consideration[] = []
  const api: ExtensionApi & { saved: Consideration[], synced: Consideration[], sheet: Record<string, Candidate[]>, failWith?: string, membersFailWith?: string, savedMembers?: Member[] } = {
    saved,
    synced,
    sheet,
    getSpreadsheetId: () => Promise.resolve(spreadsheetId),
    setSpreadsheetId: (id) => {
      spreadsheetId = id
      return Promise.resolve()
    },
    load: () => api.failWith ? Promise.reject(new Error(api.failWith)) : Promise.resolve({ ...api.sheet }),
    save: (_id, consideration) => {
      if (api.failWith) return Promise.reject(new Error(api.failWith))
      saved.push(consideration)
      api.sheet[consideration.key] = consideration.candidates
      return Promise.resolve()
    },
    sync: (_id, considerations) => {
      if (api.failWith) return Promise.reject(new Error(api.failWith))
      const missing = considerations.filter(c => !(c.key in api.sheet))
      for (const c of missing) {
        synced.push(c)
        api.sheet[c.key] = c.candidates
      }
      return Promise.resolve(missing.length)
    },
    loadMembers: () => api.membersFailWith ? Promise.reject(new Error(api.membersFailWith)) : Promise.resolve(members),
    saveMembers: (_id, saved) => {
      if (api.failWith) return Promise.reject(new Error(api.failWith))
      api.savedMembers = saved
      return Promise.resolve()
    },
  }
  return api
}

const cardLabel = (text: string) => `<span class="eden-headings-h6 eden-table-card-view__cloned-column-header" aria-hidden="true">${text}</span>`

export interface FixtureRow {
  calling: string
  /** member-card uuid; omitted for a vacant calling */
  person?: string
}

/** A table row shaped like the ones on LCR's Organizations page */
export function orgRow({ calling, person }: FixtureRow): string {
  const name = person
    ? `<button data-member-card-person-uuid="${person}" type="button" class="eden-button">Member ${person}</button>`
    : 'Calling Vacant'
  return `<tr role="row">`
    + `<td class="eden-table-td orgs__td-small">${cardLabel('Calling')}<div class="eden-stack">${calling}</div></td>`
    + `<td class="eden-table-td orgs__td-top">${cardLabel('Name')}<div class="eden-stack">${name}</div></td>`
    + `<td class="eden-table-td orgs__td-top">${cardLabel('Sustained')}1 Jan 2026</td>`
    + `<td class="eden-table-td orgs__td-top">${cardLabel('Set Apart')}</td>`
    + `<td class="eden-table-td no-print orgs__td-top">${cardLabel('')}<button type="button">Edit</button></td>`
    + `</tr>`
}

/** A section of LCR's Organizations page with one calling table */
export function orgTable(heading: string, rows: FixtureRow[]): string {
  const th = (text: string) => `<th class="eden-table-th" scope="col" role="columnheader" style="--x: 1">${cardLabel(text)}${text}</th>`
  return `<section><h3>${heading}</h3><table role="grid" class="eden-table-table">`
    + `<thead><tr role="row">${['Calling', 'Name', 'Sustained', 'Set Apart', ''].map(th).join('')}</tr></thead>`
    + `<tbody>${rows.map(orgRow).join('')}</tbody></table></section>`
}
