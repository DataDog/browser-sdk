import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import {
  CommonContext,
  makeRumPublicApi,
  RumPublicApi,
  RumUserConfiguration,
  startRum,
} from '@datadog/browser-rum-core'

import { startRecording } from './recorder'

function startRumAndRecording(userConfiguration: RumUserConfiguration, getCommonContext: () => CommonContext) {
  const startRumResult = startRum(userConfiguration, () => ({
    ...getCommonContext(),
    hasReplay: true,
  }))

  const { lifeCycle, parentContexts, configuration } = startRumResult
  startRecording(lifeCycle, userConfiguration.applicationId, configuration, parentContexts)

  return startRumResult
}

export const datadogRum = makeRumPublicApi(startRumAndRecording)

interface BrowserWindow extends Window {
  DD_RUM?: RumPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)
