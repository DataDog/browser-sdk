import {
  BoundedBuffer,
  checkCookiesAuthorized,
  checkIsNotLocalFile,
  combine,
  Context,
  ContextValue,
  getGlobalObject,
  isPercentage,
  makeGlobal,
  monitor,
  mustUseSecureCookie,
  UserConfiguration,
} from '@datadog/browser-core'

import { startRum } from './rum'
import { CustomUserAction, UserActionType } from './userActionCollection'

export interface RumUserConfiguration extends UserConfiguration {
  applicationId: string
}

export interface InternalContext {
  application_id: string
  session_id: string | undefined
  view?: {
    id: string
    url: string
    referrer: string
  }
  user_action?: {
    id: string
  }
}

export type RumGlobal = ReturnType<typeof makeRumGlobal>

export const datadogRum = makeRumGlobal(startRum)

interface BrowserWindow extends Window {
  DD_RUM?: RumGlobal
}

getGlobalObject<BrowserWindow>().DD_RUM = datadogRum

export type StartRum = typeof startRum

export function makeRumGlobal(startRumImpl: StartRum) {
  let isAlreadyInitialized = false

  let globalContext: Context = {}

  let getInternalContextStrategy: ReturnType<StartRum>['getInternalContext'] = () => {
    return undefined
  }
  const beforeInitAddUserAction = new BoundedBuffer<CustomUserAction>()
  let addUserActionStrategy: ReturnType<StartRum>['addUserAction'] = (userAction) => {
    beforeInitAddUserAction.add(userAction)
  }

  return makeGlobal({
    init: monitor((userConfiguration: RumUserConfiguration) => {
      if (
        !checkCookiesAuthorized(mustUseSecureCookie(userConfiguration)) ||
        !checkIsNotLocalFile() ||
        !canInitRum(userConfiguration)
      ) {
        return
      }
      if (userConfiguration.publicApiKey) {
        userConfiguration.clientToken = userConfiguration.publicApiKey
      }

      ;({ getInternalContext: getInternalContextStrategy, addUserAction: addUserActionStrategy } = startRumImpl(
        userConfiguration,
        () => globalContext
      ))
      beforeInitAddUserAction.drain(addUserActionStrategy)

      isAlreadyInitialized = true
    }),

    addRumGlobalContext: monitor((key: string, value: ContextValue) => {
      globalContext[key] = value
    }),

    removeRumGlobalContext: monitor((key: string) => {
      delete globalContext[key]
    }),

    setRumGlobalContext: monitor((context: Context) => {
      globalContext = context
    }),

    getInternalContext: monitor((startTime?: number) => {
      return getInternalContextStrategy(startTime)
    }),

    addUserAction: monitor((name: string, context?: Context) => {
      addUserActionStrategy({
        name,
        context: combine({}, globalContext, context),
        startTime: performance.now(),
        type: UserActionType.CUSTOM,
      })
    }),
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
    if (
      Array.isArray(userConfiguration.allowedTracingOrigins) &&
      userConfiguration.allowedTracingOrigins.length !== 0 &&
      userConfiguration.service === undefined
    ) {
      console.error('Service need to be configured when tracing is enabled')
      return false
    }
    return true
  }
}
