import {
  BoundedBuffer,
  buildCookieOptions,
  checkCookiesAuthorized,
  checkIsNotLocalFile,
  Context,
  createContextManager,
  deepClone,
  ErrorSource,
  isPercentage,
  makePublicApi,
  monitor,
  UserConfiguration,
} from '@datadog/browser-core'
import { CustomAction } from '../domain/rumEventsCollection/action/trackActions'
import { ProvidedError, ProvidedSource } from '../domain/rumEventsCollection/error/errorCollection'
import { CommonContext, User, ActionType } from '../rawRumEvent.types'
import { RumEvent } from '../rumEvent.types'
import { startRum } from './rum'

export interface RumUserConfiguration extends UserConfiguration {
  applicationId: string
  beforeSend?: (event: RumEvent) => void | boolean
}

export type RumPublicApi = ReturnType<typeof makeRumPublicApi>

export type StartRum = typeof startRum

export function makeRumPublicApi(startRumImpl: StartRum) {
  let isAlreadyInitialized = false

  const globalContextManager = createContextManager()
  let user: User = {}

  let getInternalContextStrategy: ReturnType<StartRum>['getInternalContext'] = () => undefined

  const beforeInitAddTiming = new BoundedBuffer<[string, number]>()
  let addTimingStrategy: ReturnType<StartRum>['addTiming'] = (name) => {
    beforeInitAddTiming.add([name, performance.now()])
  }

  const beforeInitAddAction = new BoundedBuffer<[CustomAction, CommonContext]>()
  let addActionStrategy: ReturnType<StartRum>['addAction'] = (action) => {
    beforeInitAddAction.add([action, clonedCommonContext()])
  }

  const beforeInitAddError = new BoundedBuffer<[ProvidedError, CommonContext]>()
  let addErrorStrategy: ReturnType<StartRum>['addError'] = (providedError) => {
    beforeInitAddError.add([providedError, clonedCommonContext()])
  }

  function clonedCommonContext(): CommonContext {
    return deepClone({
      context: globalContextManager.get(),
      user: user as Context,
    })
  }

  const rumGlobal = makePublicApi({
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
        addTiming: addTimingStrategy,
        getInternalContext: getInternalContextStrategy,
      } = startRumImpl(userConfiguration, () => ({
        user,
        context: globalContextManager.get(),
      })))
      beforeInitAddAction.drain(([action, commonContext]) => addActionStrategy(action, commonContext))
      beforeInitAddError.drain(([error, commonContext]) => addErrorStrategy(error, commonContext))
      beforeInitAddTiming.drain(([name, time]) => addTimingStrategy(name, time))

      isAlreadyInitialized = true
    }),

    addRumGlobalContext: monitor(globalContextManager.add),

    removeRumGlobalContext: monitor(globalContextManager.remove),

    getRumGlobalContext: monitor(globalContextManager.get),
    setRumGlobalContext: monitor(globalContextManager.set),

    getInternalContext: monitor((startTime?: number) => getInternalContextStrategy(startTime)),

    addAction: monitor((name: string, context?: object) => {
      addActionStrategy({
        name,
        context: deepClone(context as Context),
        startTime: performance.now(),
        type: ActionType.CUSTOM,
      })
    }),

    /**
     * @deprecated use addAction instead
     */
    addUserAction: (name: string, context?: object) => {
      rumGlobal.addAction(name, context as Context)
    },

    addError: monitor((error: unknown, context?: object, source: ProvidedSource = ErrorSource.CUSTOM) => {
      let checkedSource: ProvidedSource
      if (source === ErrorSource.CUSTOM || source === ErrorSource.NETWORK || source === ErrorSource.SOURCE) {
        checkedSource = source
      } else {
        console.error(`DD_RUM.addError: Invalid source '${source as string}'`)
        checkedSource = ErrorSource.CUSTOM
      }
      addErrorStrategy({
        error,
        context: deepClone(context as Context),
        source: checkedSource,
        startTime: performance.now(),
      })
    }),

    addTiming: monitor((name: string) => {
      addTimingStrategy(name)
    }),

    setUser: monitor((newUser: User) => {
      const sanitizedUser = sanitizeUser(newUser)
      if (sanitizedUser) {
        user = sanitizedUser
      } else {
        console.error('Unsupported user:', newUser)
      }
    }),
  })
  return rumGlobal

  function sanitizeUser(newUser: unknown) {
    if (typeof newUser !== 'object' || !newUser) {
      return
    }
    const result = deepClone(newUser as Context)
    if ('id' in result) {
      result.id = String(result.id)
    }
    if ('name' in result) {
      result.name = String(result.name)
    }
    if ('email' in result) {
      result.email = String(result.email)
    }
    return result
  }

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
