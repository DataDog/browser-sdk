import type { Context, InitConfiguration, TimeStamp, RelativeTime } from '@datadog/browser-core'
import {
  assign,
  BoundedBuffer,
  buildCookieOptions,
  createContextManager,
  deepClone,
  makePublicApi,
  monitor,
  clocksNow,
  timeStampNow,
  display,
  callMonitored,
  createHandlingStack,
  canUseEventBridge,
  areCookiesAuthorized,
} from '@datadog/browser-core'
import type { LifeCycle } from '../domain/lifeCycle'
import type { ViewContexts } from '../domain/viewContexts'
import type { RumSessionManager } from '../domain/rumSessionManager'
import type { CommonContext, User, ReplayStats } from '../rawRumEvent.types'
import { ActionType } from '../rawRumEvent.types'
import { willSyntheticsInjectRum } from '../domain/syntheticsContext'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import { validateAndBuildRumConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/rumEventsCollection/view/trackViews'
import type { startRum } from './startRum'

export type RumPublicApi = ReturnType<typeof makeRumPublicApi>

export type StartRum = typeof startRum

type StartRumResult = ReturnType<typeof startRum>

export interface RecorderApi {
  start: () => void
  stop: () => void
  onRumStart: (
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewContexts: ViewContexts
  ) => void
  isRecording: () => boolean
  getReplayStats: (viewId: string) => ReplayStats | undefined
}
interface RumPublicApiOptions {
  ignoreInitIfSyntheticsWillInjectRum?: boolean
}

export function makeRumPublicApi(
  startRumImpl: StartRum,
  recorderApi: RecorderApi,
  { ignoreInitIfSyntheticsWillInjectRum = true }: RumPublicApiOptions = {}
) {
  let isAlreadyInitialized = false

  const globalContextManager = createContextManager()
  let user: User = {}

  let getInternalContextStrategy: StartRumResult['getInternalContext'] = () => undefined
  let getInitConfigurationStrategy = (): InitConfiguration | undefined => undefined

  let bufferApiCalls = new BoundedBuffer()
  let addTimingStrategy: StartRumResult['addTiming'] = (name, time = timeStampNow()) => {
    bufferApiCalls.add(() => addTimingStrategy(name, time))
  }
  let startViewStrategy: StartRumResult['startView'] = (options, startClocks = clocksNow()) => {
    bufferApiCalls.add(() => startViewStrategy(options, startClocks))
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

  function initRum(initConfiguration: RumInitConfiguration) {
    // If we are in a Synthetics test configured to automatically inject a RUM instance, we want to
    // completely discard the customer application RUM instance by ignoring their init() call.  But,
    // we should not ignore the init() call from the Synthetics-injected RUM instance, so the
    // internal `ignoreInitIfSyntheticsWillInjectRum` option is here to bypass this condition.
    if (ignoreInitIfSyntheticsWillInjectRum && willSyntheticsInjectRum()) {
      return
    }

    if (canUseEventBridge()) {
      initConfiguration = overrideInitConfigurationForBridge(initConfiguration)
    } else if (!canHandleSession(initConfiguration)) {
      return
    }

    if (!canInitRum(initConfiguration)) {
      return
    }

    const configuration = validateAndBuildRumConfiguration(initConfiguration)
    if (!configuration) {
      return
    }

    if (!configuration.trackViewsManually) {
      doStartRum(configuration)
    } else {
      // drain beforeInitCalls by buffering them until we start RUM
      // if we get a startView, drain re-buffered calls before continuing to drain beforeInitCalls
      // in order to ensure that calls are processed in order
      const beforeInitCalls = bufferApiCalls
      bufferApiCalls = new BoundedBuffer()

      startViewStrategy = (options) => {
        doStartRum(configuration, options)
      }
      beforeInitCalls.drain()
    }
    getInitConfigurationStrategy = () => deepClone<InitConfiguration>(initConfiguration)

    isAlreadyInitialized = true
  }

  function doStartRum(configuration: RumConfiguration, initialViewOptions?: ViewOptions) {
    const startRumResults = startRumImpl(
      configuration,
      () => ({
        user,
        context: globalContextManager.get(),
        hasReplay: recorderApi.isRecording() ? true : undefined,
      }),
      recorderApi,
      initialViewOptions
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
      configuration,
      startRumResults.session,
      startRumResults.viewContexts
    )
  }

  const startView: {
    (name: string): void
    // (options: ViewOptions): void // uncomment when removing the feature flag
  } = monitor((options?: string) => {
    const sanitizedOptions = typeof options === 'object' ? options : { name: options }
    startViewStrategy(sanitizedOptions)
  })

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

    addTiming: monitor((name: string, time?: number) => {
      addTimingStrategy(name, time as RelativeTime | TimeStamp | undefined)
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

    startView,

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

  function canHandleSession(initConfiguration: RumInitConfiguration): boolean {
    if (!areCookiesAuthorized(buildCookieOptions(initConfiguration))) {
      display.warn('Cookies are not authorized, we will not send any data.')
      return false
    }

    if (isLocalFile()) {
      display.error('Execution is not allowed in the current context.')
      return false
    }
    return true
  }

  function canInitRum(initConfiguration: RumInitConfiguration) {
    if (isAlreadyInitialized) {
      if (!initConfiguration.silentMultipleInit) {
        display.error('DD_RUM is already initialized.')
      }
      return false
    }
    return true
  }

  function overrideInitConfigurationForBridge<C extends InitConfiguration>(initConfiguration: C): C {
    return assign({}, initConfiguration, {
      applicationId: '00000000-aaaa-0000-aaaa-000000000000',
      clientToken: 'empty',
      sampleRate: 100,
    })
  }

  function isLocalFile() {
    return window.location.protocol === 'file:'
  }
}
