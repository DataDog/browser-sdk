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

import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { startPerformanceCollection } from './performanceCollection'
import { startRum } from './rum'
import { startRumSession } from './rumSession'
import { version } from './version'

export interface RumUserConfiguration extends UserConfiguration {
  applicationId: string
}

export interface InternalContext {
  application_id: string
  view: {
    id: string
  }
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
  addUserAction(name: string, context: Context) {
    makeStub('addUserAction')
  },
  getInternalContext(): InternalContext | undefined {
    makeStub('getInternalContext')
    return undefined
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
  const lifeCycle = new LifeCycle()

  const { errorObservable, configuration } = commonInit(rumUserConfiguration, version)
  const session = startRumSession(configuration)
  const requestObservable = startRequestCollection()
  startPerformanceCollection(lifeCycle, session)

  errorObservable.subscribe((errorMessage) => lifeCycle.notify(LifeCycleEventType.error, errorMessage))
  requestObservable.subscribe((requestDetails) => lifeCycle.notify(LifeCycleEventType.request, requestDetails))

  const globalApi = startRum(rumUserConfiguration.applicationId, lifeCycle, configuration, session)
  lodashAssign(datadogRum, globalApi)
  return globalApi
})
