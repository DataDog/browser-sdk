import {
  BoundedBuffer,
  buildCookieOptions,
  checkCookiesAuthorized,
  checkIsNotLocalFile,
  Context,
  createContextManager,
  deepClone,
  defineGlobal,
  ErrorSource,
  getGlobalObject,
  isPercentage,
  makeGlobal,
  monitor,
  UserConfiguration,
} from '@datadog/browser-core'
import { ActionType, CustomAction } from '../domain/rumEventsCollection/action/trackActions'
import { ProvidedError } from '../domain/rumEventsCollection/error/errorCollection'
import { startRum } from './rum'

export interface RumUserConfiguration extends UserConfiguration {
  applicationId: string
}

export type RumGlobal = ReturnType<typeof makeRumGlobal>

export const datadogRum = makeRumGlobal(startRum)

interface BrowserWindow extends Window {
  DD_RUM?: RumGlobal
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_RUM', datadogRum)

export type StartRum = typeof startRum

export function makeRumGlobal(startRumImpl: StartRum) {
  let isAlreadyInitialized = false

  const globalContextManager = createContextManager()

  let getInternalContextStrategy: ReturnType<StartRum>['getInternalContext'] = () => {
    return undefined
  }

  const beforeInitAddAction = new BoundedBuffer<[CustomAction, Context]>()
  let addActionStrategy: ReturnType<StartRum>['addAction'] = (action) => {
    beforeInitAddAction.add([action, deepClone(globalContextManager.get())])
  }

  const beforeInitAddError = new BoundedBuffer<[ProvidedError, Context]>()
  let addErrorStrategy: ReturnType<StartRum>['addError'] = (providedError) => {
    beforeInitAddError.add([providedError, deepClone(globalContextManager.get())])
  }

  const rumGlobal = makeGlobal({
    init: monitor((userConfiguration: RumUserConfiguration) => {
      if (
        !checkCookiesAuthorized(buildCookieOptions(userConfiguration)) ||
        !checkIsNotLocalFile() ||
        !canInitRum(userConfiguration)
      ) {
        return
      }
      if (userConfiguration.publicApiKey) {
        userConfiguration.clientToken = userConfiguration.publicApiKey
      }

      ;({
        addAction: addActionStrategy,
        addError: addErrorStrategy,
        getInternalContext: getInternalContextStrategy,
      } = startRumImpl(userConfiguration, globalContextManager.get))
      beforeInitAddAction.drain(([action, context]) => addActionStrategy(action, context))
      beforeInitAddError.drain(([error, context]) => addErrorStrategy(error, context))

      isAlreadyInitialized = true
    }),

    addRumGlobalContext: monitor(globalContextManager.add),

    removeRumGlobalContext: monitor(globalContextManager.remove),

    getRumGlobalContext: monitor(globalContextManager.get),
    setRumGlobalContext: monitor(globalContextManager.set),

    getInternalContext: monitor((startTime?: number) => {
      return getInternalContextStrategy(startTime)
    }),

    addAction: monitor((name: string, context?: Context) => {
      addActionStrategy({
        name,
        context: deepClone(context),
        startTime: performance.now(),
        type: ActionType.CUSTOM,
      })
    }),

    addUserAction: (name: string, context?: Context) => {
      // TODO deprecate in v2
      rumGlobal.addAction(name, context)
    },

    addError: monitor(
      (
        error: unknown,
        context?: Context,
        source: ErrorSource.CUSTOM | ErrorSource.NETWORK | ErrorSource.SOURCE = ErrorSource.CUSTOM
      ) => {
        let checkedSource
        if (source === ErrorSource.CUSTOM || source === ErrorSource.NETWORK || source === ErrorSource.SOURCE) {
          checkedSource = source
        } else {
          console.error(`DD_RUM.addError: Invalid source '${source}'`)
          checkedSource = ErrorSource.CUSTOM
        }
        addErrorStrategy({
          error,
          context: deepClone(context),
          source: checkedSource,
          startTime: performance.now(),
        })
      }
    ),
  })
  return rumGlobal

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
