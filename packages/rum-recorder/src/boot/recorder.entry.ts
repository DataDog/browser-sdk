import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { startRum } from '@datadog/browser-rum-core'

import { startRecording } from './startRecording'
import { RumRecorderPublicApi, makeRumRecorderPublicApi } from './rumRecorderPublicApi'

export const datadogRum = makeRumRecorderPublicApi(startRum, startRecording)

interface BrowserWindow extends Window {
  DD_RUM?: RumRecorderPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
