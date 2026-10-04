import { fetchMemberList } from '../lcr/memberList'
import type { Member } from '../lcr/members'
import type { Consideration, Tracking } from '../shared/consideration'
import type { BackgroundRequest, BackgroundResponses, Result } from '../shared/messages'

/** What the panel needs from the extension, so it can be tested without Chrome */
export interface ExtensionApi {
  getSpreadsheetId: () => Promise<string | undefined>
  setSpreadsheetId: (id: string) => Promise<void>
  /** key → who is being considered, and where the holder is */
  load: (spreadsheetId: string) => Promise<Record<string, Tracking>>
  save: (spreadsheetId: string, consideration: Consideration) => Promise<void>
  /** Adds a row for each calling not in the sheet yet; returns how many were added */
  sync: (spreadsheetId: string, considerations: Consideration[]) => Promise<number>
  /** the unit's members, to pick candidates from */
  loadMembers: () => Promise<Member[]>
  /** Copies members' names into the sheet, for pages away from LCR */
  saveMembers: (spreadsheetId: string, members: Member[]) => Promise<void>
}

async function send<T extends BackgroundRequest>(request: T): Promise<BackgroundResponses[T['type']]> {
  const result = await chrome.runtime.sendMessage<T, Result<BackgroundResponses[T['type']]>>(request)
  if (!result.ok) throw new Error(result.error)
  return result.data
}

const SPREADSHEET_ID = 'spreadsheetId'

export const chromeApi: ExtensionApi = {
  async getSpreadsheetId() {
    const { [SPREADSHEET_ID]: id } = await chrome.storage.sync.get(SPREADSHEET_ID)
    return typeof id === 'string' ? id : undefined
  },
  setSpreadsheetId: id => chrome.storage.sync.set({ [SPREADSHEET_ID]: id }),
  load: spreadsheetId => send({ type: 'load', spreadsheetId }),
  save: async (spreadsheetId, consideration) => {
    await send({ type: 'save', spreadsheetId, consideration })
  },
  sync: (spreadsheetId, considerations) => send({ type: 'sync', spreadsheetId, considerations }),
  // LCR's session cookie only goes with requests from the page's own origin,
  // so this is fetched here rather than in the background
  loadMembers: () => fetchMemberList(location.origin, fetch, new URLSearchParams(location.search).get('lang') ?? 'eng'),
  saveMembers: async (spreadsheetId, members) => {
    // only the id and name: the rest of LCR's member record stays out of the sheet
    await send({ type: 'saveMembers', spreadsheetId, members: members.map(({ uuid, name }) => ({ uuid, name })) })
  },
}
