import lodashAssign from 'lodash.assign'

import { UserConfiguration } from '@browser-agent/core/src/configuration'
import { commonInit, makeGlobal, makeStub } from '@browser-agent/core/src/init'
import { monitor } from '@browser-agent/core/src/internalMonitoring'
import { startRequestCollection } from '@browser-agent/core/src/requestCollection'
import { Context, ContextValue, isPercentage } from '@browser-agent/core/src/utils'
import { startRum } from './rum'
import { startRumSession } from './rumSession'
import { version } from './version'

declare global {
  interface Window {
    DD_RUM: RumGlobal
  }
}

export interface RumUserConfiguration extends UserConfiguration {
  applicationId: string
}

const STUBBED_RUM = {
  init(userConfiguration: RumUserConfiguration) {
    makeStub('core.init')
  },
  addRumGlobalContext(key: string, value: ContextValue) {
    makeStub('addRumGlobalContext')
  },
  setRumGlobalContext(context: Context) {
    makeStub('setRumGlobalContext')
  },
  addCustomEvent(name: string, context: Context) {
    makeStub('addCustomEvent')
  },
}

export type RumGlobal = typeof STUBBED_RUM

window.DD_RUM = makeGlobal(STUBBED_RUM)
window.DD_RUM.init = monitor((userConfiguration: RumUserConfiguration) => {
  if (!userConfiguration || (!userConfiguration.clientToken && !userConfiguration.publicApiKey)) {
    console.error('Client Token is not configured, we will not send any data.')
    return
  }
  if (userConfiguration.publicApiKey) {
    userConfiguration.clientToken = userConfiguration.publicApiKey
  }
  if (!userConfiguration.applicationId) {
    console.error('Application ID is not configured, no RUM data will be collected.')
    return
  }
  if (userConfiguration.sampleRate !== undefined && !isPercentage(userConfiguration.sampleRate)) {
    console.error('Sample Rate should be a number between 0 and 100')
    return
  }
  if (userConfiguration.resourceSampleRate !== undefined && !isPercentage(userConfiguration.resourceSampleRate)) {
    console.error('Resource Sample Rate should be a number between 0 and 100')
    return
  }
  const rumUserConfiguration = { ...userConfiguration, isCollectingError: true }

  const { errorObservable, configuration } = commonInit(rumUserConfiguration, version)
  const session = startRumSession(configuration)
  const requestObservable = startRequestCollection()

  const globalApi = startRum(
    rumUserConfiguration.applicationId,
    errorObservable,
    requestObservable,
    configuration,
    session
  )
  lodashAssign(window.DD_RUM, globalApi)
})
