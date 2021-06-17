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
  timeStampNow,
  display,
  commonInit,
  Configuration,
  InternalMonitoring,
  callMonitored,
  createHandlingStack,
} from '@datadog/browser-core'
import { ProvidedSource } from '../domain/rumEventsCollection/error/errorCollection'
import { CommonContext, User, ActionType, RumEventDomainContext } from '../rawRumEvent.types'
import { RumEvent } from '../rumEvent.types'
import { buildEnv } from './buildEnv'
import { startRum } from './startRum'

export interface RumUserConfiguration extends UserConfiguration {
  applicationId: string
  beforeSend?: (event: RumEvent, context: RumEventDomainContext) => void | boolean
}

export type RumPublicApi = ReturnType<typeof makeRumPublicApi>

export type StartRum<C extends RumUserConfiguration = RumUserConfiguration> = (
  userConfiguration: C,
  configuration: Configuration,
  internalMonitoring: InternalMonitoring,
  getCommonContext: () => CommonContext,
  initialViewName?: string
) => StartRumResult

type StartRumResult = ReturnType<typeof startRum>

export function makeRumPublicApi<C extends RumUserConfiguration>(startRumImpl: StartRum<C>) {
  let isAlreadyInitialized = false

  const globalContextManager = createContextManager()
  let user: User = {}

  let getInternalContextStrategy: StartRumResult['getInternalContext'] = () => undefined

  let bufferApiCalls = new BoundedBuffer()
  let addTimingStrategy: StartRumResult['addTiming'] = (name, time = timeStampNow()) => {
    bufferApiCalls.add(() => addTimingStrategy(name, time))
  }
  let startViewStrategy: StartRumResult['startView'] = (name, startClocks = clocksNow()) => {
    bufferApiCalls.add(() => startViewStrategy(name, startClocks))
  }
  let addActionStrategy: StartRumResult['addAction'] = (action, commonContext = clonedCommonContext()) => {
    bufferApiCalls.add(() => addActionStrategy(action, commonContext))
  }
  let addErrorStrategy: StartRumResult['addError'] = (providedError, commonContext = clonedCommonContext()) => {
    bufferApiCalls.add(() => addErrorStrategy(providedError, commonContext))
  }

  function clonedCommonContext(): CommonContext {
    return deepClone({
      context: globalContextManager.get(),
      user: user as Context,
    })
  }

  function initRum(userConfiguration: C) {
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

    const { configuration, internalMonitoring } = commonInit(userConfiguration, buildEnv)
    if (!configuration.isEnabled('view-renaming') || !configuration.trackViewsManually) {
      doStartRum()
    } else {
      // drain beforeInitCalls by buffering them until we start RUM
      // if we get a startView, drain re-buffered calls before continuing to drain beforeInitCalls
      // in order to ensure that calls are processed in order
      const beforeInitCalls = bufferApiCalls
      bufferApiCalls = new BoundedBuffer()

      startViewStrategy = (name) => {
        doStartRum(name)
      }
      beforeInitCalls.drain()
    }
    isAlreadyInitialized = true

    function doStartRum(initialViewName?: string) {
      let startView
      ;({
        startView,
        addAction: addActionStrategy,
        addError: addErrorStrategy,
        addTiming: addTimingStrategy,
        getInternalContext: getInternalContextStrategy,
      } = startRumImpl(
        userConfiguration,
        configuration,
        internalMonitoring,
        () => ({
          user,
          context: globalContextManager.get(),
        }),
        initialViewName
      ))
      if (configuration.isEnabled('view-renaming')) {
        startViewStrategy = startView
      }
      bufferApiCalls.drain()
    }
  }

  const rumPublicApi = makePublicApi({
    init: monitor(initRum),

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

    addError: (error: unknown, context?: object, source: ProvidedSource = ErrorSource.CUSTOM) => {
      const handlingStack = createHandlingStack()
      callMonitored(() => {
        let checkedSource: ProvidedSource
        if (source === ErrorSource.CUSTOM || source === ErrorSource.NETWORK || source === ErrorSource.SOURCE) {
          checkedSource = source
        } else {
          display.error(`DD_RUM.addError: Invalid source '${source as string}'`)
          checkedSource = ErrorSource.CUSTOM
        }
        addErrorStrategy({
          error,
          handlingStack,
          context: deepClone(context as Context),
          source: checkedSource,
          startClocks: clocksNow(),
        })
      })
    },

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
