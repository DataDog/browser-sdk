import { globalObject } from '@datadog/js-core/util'
import { defineGlobal, noop } from '@datadog/browser-core'
import type { ProfilerApi, RumPublicApi } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApi } from '../boot/recorderApi'
import { startRecording } from '../boot/datadogRecorder'

interface BrowserWindow {
  DD_RUM?: RumPublicApi
}

const profilerApi: ProfilerApi = { onRumStart: noop, stop: noop }

export const datadogRum = makeRumPublicApi(
  makeRecorderApi(async () => startRecording),
  profilerApi,
  {
    sdkName: 'rum-salesforce',
  }
)

defineGlobal(globalObject as BrowserWindow, 'DD_RUM', datadogRum)
