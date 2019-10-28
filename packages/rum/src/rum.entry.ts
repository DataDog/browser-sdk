import {
  areCookiesAuthorized,
  commonInit,
  Context,
  ContextValue,
  isPercentage,
  makeGlobal,
  makeStub,
  monitor,
  startRequestCollection,
  UserConfiguration,
} from '@browser-agent/core'
import lodashAssign from 'lodash.assign'

import { startRum } from './rum'
import { startRumSession } from './rumSession'
import { version } from './version'

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

export const datadogRum = makeGlobal(STUBBED_RUM)
datadogRum.init = monitor((userConfiguration: RumUserConfiguration) => {
  if (!areCookiesAuthorized()) {
    console.error('Cookies are not authorized, we will not send any data.')
    return
  }
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

  const { messageObservable, configuration } = commonInit(rumUserConfiguration, version)
  const session = startRumSession(configuration)
  startRequestCollection(messageObservable)

  const globalApi = startRum(rumUserConfiguration.applicationId, messageObservable, configuration, session)
  lodashAssign(datadogRum, globalApi)
})
