import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { buildEnv, makeRumPublicApi, RumPublicApi, startRum } from '@datadog/browser-rum-core'

import { startRecording } from './startRecording'
import { makeRecorderApi } from './recorderApi'

const recorderApi = makeRecorderApi(startRecording)
export const datadogRum = makeRumPublicApi(startRum, recorderApi)

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
  DD_SYNTHETICS_INJECTED_RUM?: RumPublicApi
}
defineGlobal(
  getGlobalObject<BrowserWindow>(),
  buildEnv.syntheticsBundle ? 'DD_SYNTHETICS_INJECTED_RUM' : 'DD_RUM',
  datadogRum
)
