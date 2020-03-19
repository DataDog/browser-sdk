import {
  checkCookiesAuthorized,
  checkIsNotLocalFile,
  commonInit,
  Context,
  ContextValue,
  getGlobalObject,
  isPercentage,
  makeGlobal,
  makeStub,
  monitor,
  startRequestCollection,
  UserConfiguration,
} from '@datadog/browser-core'
import lodashAssign from 'lodash.assign'

import { buildEnv } from './buildEnv'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { startPerformanceCollection } from './performanceCollection'
import { startRum } from './rum'
import { startRumSession } from './rumSession'

export interface RumUserConfiguration extends UserConfiguration {
  applicationId: string
}

export interface InternalContext {
  application_id: string
  session_id: string | undefined
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
let isAlreadyInitialized = false
datadogRum.init = monitor((userConfiguration: RumUserConfiguration) => {
  if (!checkCookiesAuthorized() || !checkIsNotLocalFile() || !canInitRum(userConfiguration)) {
    return
  }
  if (userConfiguration.publicApiKey) {
    userConfiguration.clientToken = userConfiguration.publicApiKey
  }
  const rumUserConfiguration = { ...userConfiguration, isCollectingError: true }
  const lifeCycle = new LifeCycle()

  const { errorObservable, configuration, internalMonitoring } = commonInit(rumUserConfiguration, buildEnv)
  const session = startRumSession(configuration, lifeCycle)
  const globalApi = startRum(rumUserConfiguration.applicationId, lifeCycle, configuration, session, internalMonitoring)

  const requestObservable = startRequestCollection()
  startPerformanceCollection(lifeCycle, session)

  errorObservable.subscribe((errorMessage) => lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, errorMessage))
  requestObservable.subscribe((requestDetails) =>
    lifeCycle.notify(LifeCycleEventType.REQUEST_COLLECTED, requestDetails)
  )

  lodashAssign(datadogRum, globalApi)
  isAlreadyInitialized = true
})

function canInitRum(userConfiguration: RumUserConfiguration) {
  if (isAlreadyInitialized) {
    if (!userConfiguration.silentMultipleInit) {
      console.error('DD_RUM is already initialized.')
    }
    return false
  }
  if (!userConfiguration || (!userConfiguration.clientToken && !userConfiguration.publicApiKey)) {
    console.error('Client Token is not configured, we will not send any data.')
    return false
  }
  if (!userConfiguration.applicationId) {
    console.error('Application ID is not configured, no RUM data will be collected.')
    return false
  }
  if (userConfiguration.sampleRate !== undefined && !isPercentage(userConfiguration.sampleRate)) {
    console.error('Sample Rate should be a number between 0 and 100')
    return false
  }
  if (userConfiguration.resourceSampleRate !== undefined && !isPercentage(userConfiguration.resourceSampleRate)) {
    console.error('Resource Sample Rate should be a number between 0 and 100')
    return false
  }
  return true
}

interface BrowserWindow extends Window {
  DD_RUM?: RumGlobal
}

getGlobalObject<BrowserWindow>().DD_RUM = datadogRum
