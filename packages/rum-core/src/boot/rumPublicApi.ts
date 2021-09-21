import {
  BoundedBuffer,
  buildCookieOptions,
  checkCookiesAuthorized,
  checkIsNotLocalFile,
  Context,
  createContextManager,
  deepClone,
  isPercentage,
  makePublicApi,
  monitor,
  InitConfiguration,
  clocksNow,
  timeStampNow,
  display,
  commonInit,
  Configuration,
  InternalMonitoring,
  callMonitored,
  createHandlingStack,
  DefaultPrivacyLevel,
} from '@datadog/browser-core'
import { LifeCycle } from '../domain/lifeCycle'
import { ParentContexts } from '../domain/parentContexts'
import { RumSession } from '../domain/rumSession'
import { RumEventDomainContext } from '../domainContext.types'
import { CommonContext, User, ActionType, ReplayStats } from '../rawRumEvent.types'
import { RumEvent } from '../rumEvent.types'
import { buildEnv } from './buildEnv'
import { startRum } from './startRum'

export interface RumInitConfiguration extends InitConfiguration {
  applicationId: string
  beforeSend?: (event: RumEvent, context: RumEventDomainContext) => void | boolean
  defaultPrivacyLevel?: DefaultPrivacyLevel
}

export type RumPublicApi = ReturnType<typeof makeRumPublicApi>

export type StartRum<C extends RumInitConfiguration = RumInitConfiguration> = (
  initConfiguration: C,
  configuration: Configuration,
  internalMonitoring: InternalMonitoring,
  getCommonContext: () => CommonContext,
  recorderApi: RecorderApi,
  initialViewName?: string
) => StartRumResult

type StartRumResult = ReturnType<typeof startRum>

export interface RecorderApi {
  start: () => void
  stop: () => void
  onRumStart: (
    lifeCycle: LifeCycle,
    initConfiguration: RumInitConfiguration,
    configuration: Configuration,
    session: RumSession,
    parentContexts: ParentContexts
  ) => void
  isRecording: () => boolean
  getReplayStats: (viewId: string) => ReplayStats | undefined
}

export function makeRumPublicApi<C extends RumInitConfiguration>(startRumImpl: StartRum<C>, recorderApi: RecorderApi) {
  let isAlreadyInitialized = false

  const globalContextManager = createContextManager()
  let user: User = {}

  let getInternalContextStrategy: StartRumResult['getInternalContext'] = () => undefined
  let getInitConfigurationStrategy = (): InitConfiguration | undefined => undefined

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

  function initRum(initConfiguration: C) {
    if (
      !checkCookiesAuthorized(buildCookieOptions(initConfiguration)) ||
      !checkIsNotLocalFile() ||
      !canInitRum(initConfiguration)
    ) {
      return
    }

    const { configuration, internalMonitoring } = commonInit(initConfiguration, buildEnv)
    if (!configuration.trackViewsManually) {
      doStartRum(initConfiguration, configuration, internalMonitoring)
    } else {
      // drain beforeInitCalls by buffering them until we start RUM
      // if we get a startView, drain re-buffered calls before continuing to drain beforeInitCalls
      // in order to ensure that calls are processed in order
      const beforeInitCalls = bufferApiCalls
      bufferApiCalls = new BoundedBuffer()

      startViewStrategy = (name) => {
        doStartRum(initConfiguration, configuration, internalMonitoring, name)
      }
      beforeInitCalls.drain()
    }
    getInitConfigurationStrategy = () => deepClone<InitConfiguration>(initConfiguration)

    isAlreadyInitialized = true
  }

  function doStartRum(
    initConfiguration: C,
    configuration: Configuration,
    internalMonitoring: InternalMonitoring,
    initialViewName?: string
  ) {
    const startRumResults = startRumImpl(
      initConfiguration,
      configuration,
      internalMonitoring,
      () => ({
        user,
        context: globalContextManager.get(),
        hasReplay: recorderApi.isRecording() ? true : undefined,
      }),
      recorderApi,
      initialViewName
    )

    ;({
      startView: startViewStrategy,
      addAction: addActionStrategy,
      addError: addErrorStrategy,
      addTiming: addTimingStrategy,
      getInternalContext: getInternalContextStrategy,
    } = startRumResults)
    bufferApiCalls.drain()

    recorderApi.onRumStart(
      startRumResults.lifeCycle,
      initConfiguration,
      configuration,
      startRumResults.session,
      startRumResults.parentContexts
    )
  }

  const rumPublicApi = makePublicApi({
    init: monitor(initRum),

    addRumGlobalContext: monitor(globalContextManager.add),

    removeRumGlobalContext: monitor(globalContextManager.remove),

    getRumGlobalContext: monitor(globalContextManager.get),
    setRumGlobalContext: monitor(globalContextManager.set),

    getInternalContext: monitor((startTime?: number) => getInternalContextStrategy(startTime)),
    getInitConfiguration: monitor(() => getInitConfigurationStrategy()),

    addAction: monitor((name: string, context?: object) => {
      addActionStrategy({
        name,
        context: deepClone(context as Context),
        startClocks: clocksNow(),
        type: ActionType.CUSTOM,
      })
    }),

    addError: (error: unknown, context?: object) => {
      const handlingStack = createHandlingStack()
      callMonitored(() => {
        addErrorStrategy({
          error,
          handlingStack,
          context: deepClone(context as Context),
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

    startView: monitor((name?: string) => {
      startViewStrategy(name)
    }),

    startSessionReplayRecording: monitor(recorderApi.start),
    stopSessionReplayRecording: monitor(recorderApi.stop),
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

  function canInitRum(initConfiguration: RumInitConfiguration) {
    if (isAlreadyInitialized) {
      if (!initConfiguration.silentMultipleInit) {
        display.error('DD_RUM is already initialized.')
      }
      return false
    }
    if (!initConfiguration || !initConfiguration.clientToken) {
      display.error('Client Token is not configured, we will not send any data.')
      return false
    }
    if (!initConfiguration.applicationId) {
      display.error('Application ID is not configured, no RUM data will be collected.')
      return false
    }
    if (initConfiguration.sampleRate !== undefined && !isPercentage(initConfiguration.sampleRate)) {
      display.error('Sample Rate should be a number between 0 and 100')
      return false
    }
    if (initConfiguration.replaySampleRate !== undefined && !isPercentage(initConfiguration.replaySampleRate)) {
      display.error('Replay Sample Rate should be a number between 0 and 100')
      return false
    }
    if (
      Array.isArray(initConfiguration.allowedTracingOrigins) &&
      initConfiguration.allowedTracingOrigins.length !== 0 &&
      initConfiguration.service === undefined
    ) {
      display.error('Service need to be configured when tracing is enabled')
      return false
    }
    return true
  }
}
