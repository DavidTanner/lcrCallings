/**
 * Google's file picker. With the drive.file scope the app can open only the
 * sheets someone has chosen for it here, so everyone who uses a sheet picks
 * it once. See https://developers.google.com/drive/picker/guides/overview
 */
const GAPI_URL = 'https://apis.google.com/js/api.js'

interface PickedDoc { id: string }

export interface PickerResponse {
  action: string
  docs?: PickedDoc[]
}

interface DocsView {
  setMode: (mode: string) => DocsView
  /** comma-separated; opens the picker on just these files */
  setFileIds: (ids: string) => DocsView
}

interface PickerBuilder {
  addView: (view: DocsView) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setDeveloperKey: (key: string) => PickerBuilder
  setAppId: (id: string) => PickerBuilder
  setOrigin: (origin: string) => PickerBuilder
  setTitle: (title: string) => PickerBuilder
  setCallback: (callback: (response: PickerResponse) => void) => PickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

/** `google.picker` */
export interface Picker {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId: string) => DocsView
  ViewId: { SPREADSHEETS: string }
  DocsViewMode: { LIST: string }
  Action: { PICKED: string, CANCEL: string }
}

interface Gapi {
  load: (api: string, callbacks: { callback: () => void, onerror: () => void }) => void
}

/** Adds Google's script for the picker to the page, once */
export function loadPicker(doc: Document = document): Promise<Picker> {
  const view = doc.defaultView as (Window & { gapi?: Gapi, google?: { picker?: Picker } }) | null
  const ready = () => view?.google?.picker
  const loaded = ready()
  if (loaded) return Promise.resolve(loaded)
  const failed = new Error('Couldn\'t load Google\'s file picker. Check the connection and try again.')
  return new Promise((resolve, reject) => {
    const load = (gapi: Gapi) => {
      gapi.load('picker', {
        callback: () => {
          const picker = ready()
          if (picker) resolve(picker)
          else reject(failed)
        },
        onerror: () => {
          reject(failed)
        },
      })
    }
    if (view?.gapi) {
      load(view.gapi)
      return
    }
    const script = doc.createElement('script')
    script.src = GAPI_URL
    script.async = true
    script.onload = () => {
      if (view?.gapi) load(view.gapi)
      else reject(failed)
    }
    script.onerror = () => {
      reject(failed)
    }
    doc.head.append(script)
  })
}

export interface PickOptions {
  token: string
  /** the Google Cloud project's number, which access is granted to */
  appId: string
  /** an API key from the same project, allowed to use the Google Picker API */
  apiKey?: string
  /** this page's origin */
  origin: string
  /** opens the picker on just this sheet, e.g. one from a shared link */
  spreadsheetId?: string
}

/** The OAuth client id starts with the project's number, e.g. `1234-abc.apps.googleusercontent.com` */
export const projectNumber = (clientId: string) => /^(\d+)-/.exec(clientId)?.[1] ?? ''

/** Shows the picker for Google Sheets; resolves with the chosen sheet's id, or undefined if cancelled */
export function pickSpreadsheet(picker: Picker, { token, appId, apiKey, origin, spreadsheetId }: PickOptions): Promise<string | undefined> {
  const view = new picker.DocsView(picker.ViewId.SPREADSHEETS).setMode(picker.DocsViewMode.LIST)
  if (spreadsheetId) view.setFileIds(spreadsheetId)
  return new Promise((resolve) => {
    const builder = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setAppId(appId)
      .setOrigin(origin)
      .setTitle(spreadsheetId ? 'Choose the sheet to open it' : 'Choose a Google Sheet')
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED) resolve(response.docs?.[0]?.id)
        else if (response.action === picker.Action.CANCEL) resolve(undefined)
      })
    if (apiKey) builder.setDeveloperKey(apiKey)
    builder.build().setVisible(true)
  })
}
