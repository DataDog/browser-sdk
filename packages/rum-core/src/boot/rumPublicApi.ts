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
  clocksNow,
  TimeStamp,
  timeStampNow,
  ClocksState,
  display,
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

export type StartRum<C extends RumUserConfiguration = RumUserConfiguration> = (
  userConfiguration: C,
  getCommonContext: () => CommonContext
) => StartRumResult

type StartRumResult = ReturnType<typeof startRum>

export function makeRumPublicApi<C extends RumUserConfiguration>(startRumImpl: StartRum<C>) {
  let isAlreadyInitialized = false

  const globalContextManager = createContextManager()
  let user: User = {}

  let getInternalContextStrategy: StartRumResult['getInternalContext'] = () => undefined

  const beforeInitApiCalls = new BoundedBuffer()
  let addTimingStrategy: StartRumResult['addTiming'] = (name) => {
    beforeInitApiCalls.add<[string, TimeStamp]>([name, timeStampNow()], ([name, time]) => addTimingStrategy(name, time))
  }
  let startViewStrategy: StartRumResult['startView'] = (name) => {
    beforeInitApiCalls.add<[string | undefined, ClocksState]>([name, clocksNow()], ([name, startClocks]) =>
      startViewStrategy(name, startClocks)
    )
  }
  let addActionStrategy: StartRumResult['addAction'] = (action) => {
    beforeInitApiCalls.add<[CustomAction, CommonContext]>([action, clonedCommonContext()], ([action, commonContext]) =>
      addActionStrategy(action, commonContext)
    )
  }
  let addErrorStrategy: StartRumResult['addError'] = (providedError) => {
    beforeInitApiCalls.add<[ProvidedError, CommonContext]>(
      [providedError, clonedCommonContext()],
      ([error, commonContext]) => addErrorStrategy(error, commonContext)
    )
  }

  function clonedCommonContext(): CommonContext {
    return deepClone({
      context: globalContextManager.get(),
      user: user as Context,
    })
  }

  const rumPublicApi = makePublicApi({
    init: monitor((userConfiguration: C) => {
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

      let configuration
      let startView
      ;({
        configuration,
        startView,
        addAction: addActionStrategy,
        addError: addErrorStrategy,
        addTiming: addTimingStrategy,
        getInternalContext: getInternalContextStrategy,
      } = startRumImpl(userConfiguration, () => ({
        user,
        context: globalContextManager.get(),
      })))
      if (configuration.isEnabled('view-renaming')) {
        startViewStrategy = startView
      }
      beforeInitApiCalls.drain()
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
        startClocks: clocksNow(),
        type: ActionType.CUSTOM,
      })
    }),

    /**
     * @deprecated use addAction instead
     */
    addUserAction: (name: string, context?: object) => {
      rumPublicApi.addAction(name, context as Context)
    },

    addError: monitor((error: unknown, context?: object, source: ProvidedSource = ErrorSource.CUSTOM) => {
      let checkedSource: ProvidedSource
      if (source === ErrorSource.CUSTOM || source === ErrorSource.NETWORK || source === ErrorSource.SOURCE) {
        checkedSource = source
      } else {
        display.error(`DD_RUM.addError: Invalid source '${source as string}'`)
        checkedSource = ErrorSource.CUSTOM
      }
      addErrorStrategy({
        error,
        context: deepClone(context as Context),
        source: checkedSource,
        startClocks: clocksNow(),
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
        display.error('Unsupported user:', newUser)
      }
    }),

    removeUser: monitor(() => {
      user = {}
    }),
  })
  ;(rumPublicApi as any)['startView'] = monitor((name?: string) => {
    startViewStrategy(name)
  })
  return rumPublicApi

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
        display.error('DD_RUM is already initialized.')
      }
      return false
    }
    if (!userConfiguration || (!userConfiguration.clientToken && !userConfiguration.publicApiKey)) {
      display.error('Client Token is not configured, we will not send any data.')
      return false
    }
    if (!userConfiguration.applicationId) {
      display.error('Application ID is not configured, no RUM data will be collected.')
      return false
    }
    if (userConfiguration.sampleRate !== undefined && !isPercentage(userConfiguration.sampleRate)) {
      display.error('Sample Rate should be a number between 0 and 100')
      return false
    }
    if (userConfiguration.resourceSampleRate !== undefined && !isPercentage(userConfiguration.resourceSampleRate)) {
      display.error('Resource Sample Rate should be a number between 0 and 100')
      return false
    }
    if (
      Array.isArray(userConfiguration.allowedTracingOrigins) &&
      userConfiguration.allowedTracingOrigins.length !== 0 &&
      userConfiguration.service === undefined
    ) {
      display.error('Service need to be configured when tracing is enabled')
      return false
    }
    return true
  }
}
