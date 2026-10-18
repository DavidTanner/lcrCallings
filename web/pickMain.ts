import { APP_NAME } from '../src/constants'
import { answerPicks } from './pick'
import { loadPicker } from './picker'

// set when building, from the environment (see scripts/web.ts)
const CLIENT_ID = process.env.WEB_OAUTH_CLIENT_ID ?? ''
const PICKER_API_KEY = process.env.PICKER_API_KEY || undefined

if (!answerPicks({ win: window, clientId: CLIENT_ID, apiKey: PICKER_API_KEY, load: () => loadPicker() })) {
  document.body.textContent = `This page shows Google's file picker for the ${APP_NAME} extension.`
}
