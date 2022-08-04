import type { Context, InitConfiguration, TimeStamp, RelativeTime } from '@datadog/browser-core'
import {
  willSyntheticsInjectRum,
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
import type { ViewContexts } from '../domain/contexts/viewContexts'
import type { RumSessionManager } from '../domain/rumSessionManager'
import type { User, ReplayStats } from '../rawRumEvent.types'
import { ActionType } from '../rawRumEvent.types'
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
  const userContextManager = createContextManager()

  let getInternalContextStrategy: StartRumResult['getInternalContext'] = () => undefined
  let getInitConfigurationStrategy = (): InitConfiguration | undefined => undefined

  let bufferApiCalls = new BoundedBuffer()
  let addTimingStrategy: StartRumResult['addTiming'] = (name, time = timeStampNow()) => {
    bufferApiCalls.add(() => addTimingStrategy(name, time))
  }
  let startViewStrategy: StartRumResult['startView'] = (options, startClocks = clocksNow()) => {
    bufferApiCalls.add(() => startViewStrategy(options, startClocks))
  }
  let addActionStrategy: StartRumResult['addAction'] = (
    action,
    commonContext = {
      context: globalContextManager.getContext(),
      user: userContextManager.getContext(),
    }
  ) => {
    bufferApiCalls.add(() => addActionStrategy(action, commonContext))
  }
  let addErrorStrategy: StartRumResult['addError'] = (
    providedError,
    commonContext = {
      context: globalContextManager.getContext(),
      user: userContextManager.getContext(),
    }
  ) => {
    bufferApiCalls.add(() => addErrorStrategy(providedError, commonContext))
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
        user: userContextManager.getContext(),
        context: globalContextManager.getContext(),
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
    (name?: string): void
    (options: ViewOptions): void
  } = monitor((options?: string | ViewOptions) => {
    const sanitizedOptions = typeof options === 'object' ? options : { name: options }
    startViewStrategy(sanitizedOptions)
  })

  const rumPublicApi = makePublicApi({
    init: monitor(initRum),

    /** @deprecated: use setGlobalContextProperty instead */
    addRumGlobalContext: monitor(globalContextManager.add),
    setGlobalContextProperty: monitor(globalContextManager.setContextProperty),

    /** @deprecated: use removeGlobalContextProperty instead */
    removeRumGlobalContext: monitor(globalContextManager.remove),
    removeGlobalContextProperty: monitor(globalContextManager.removeContextProperty),

    /** @deprecated: use getGlobalContext instead */
    getRumGlobalContext: monitor(globalContextManager.get),
    getGlobalContext: monitor(globalContextManager.getContext),

    /** @deprecated: use setGlobalContext instead */
    setRumGlobalContext: monitor(globalContextManager.set),
    setGlobalContext: monitor(globalContextManager.setContext),

    clearGlobalContext: monitor(globalContextManager.clearContext),

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
      if (typeof newUser !== 'object' || !newUser) {
        display.error('Unsupported user:', newUser)
      } else {
        userContextManager.setContext(sanitizeUser(newUser as Context))
      }
    }),

    getUser: monitor(userContextManager.getContext),

    setUserProperty: monitor((key, property) => {
      const sanitizedProperty = sanitizeUser({ [key]: property })[key]
      userContextManager.setContextProperty(key, sanitizedProperty)
    }),

    removeUserProperty: monitor(userContextManager.removeContextProperty),

    /** @deprecated: renamed to clearUser */
    removeUser: monitor(userContextManager.clearContext),
    clearUser: monitor(userContextManager.clearContext),

    startView,

    startSessionReplayRecording: monitor(recorderApi.start),
    stopSessionReplayRecording: monitor(recorderApi.stop),
  })
  return rumPublicApi

  function sanitizeUser(newUser: Context) {
    const shallowClonedUser = assign(newUser, {})
    if ('id' in shallowClonedUser) {
      shallowClonedUser.id = String(shallowClonedUser.id)
    }
    if ('name' in shallowClonedUser) {
      shallowClonedUser.name = String(shallowClonedUser.name)
    }
    if ('email' in shallowClonedUser) {
      shallowClonedUser.email = String(shallowClonedUser.email)
    }
    return shallowClonedUser
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
