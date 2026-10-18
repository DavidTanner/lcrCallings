import type { Picker, PickerResponse } from '../web/picker'

/** `google.picker`, recording how it was set up and answering with `respond` */
export function fakePicker() {
  const calls: Record<string, unknown> = {}
  let callback: ((response: PickerResponse) => void) | undefined
  const record = <T>(self: T, name: string) => (value: unknown) => {
    calls[name] = value
    return self
  }
  class DocsView {
    constructor(viewId: string) {
      calls.viewId = viewId
    }

    setMode = record(this, 'mode')
    setFileIds = record(this, 'fileIds')
  }
  class PickerBuilder {
    addView = record(this, 'view')
    setOAuthToken = record(this, 'token')
    setDeveloperKey = record(this, 'apiKey')
    setAppId = record(this, 'appId')
    setOrigin = record(this, 'origin')
    setTitle = record(this, 'title')
    setCallback = (c: (response: PickerResponse) => void) => {
      callback = c
      return this
    }

    build = () => ({ setVisible: record(undefined, 'visible') })
  }
  const picker = {
    PickerBuilder,
    DocsView,
    ViewId: { SPREADSHEETS: 'spreadsheets' },
    DocsViewMode: { LIST: 'list' },
    Action: { PICKED: 'picked', CANCEL: 'cancel' },
  } as unknown as Picker
  return { picker, calls, respond: (response: PickerResponse) => callback?.(response) }
}
