import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { makeRumPublicApi, RumPublicApi, startRum } from '@datadog/browser-rum-core'

import { startRecording } from './startRecording'
import { makeRecorderApi } from './rumRecorderPublicApi'

const recorderApi = makeRecorderApi(startRecording)
export const datadogRum = makeRumPublicApi(startRum, recorderApi)

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
