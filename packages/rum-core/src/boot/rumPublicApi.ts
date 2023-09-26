import type { Context, InitConfiguration, TimeStamp, RelativeTime, User } from '@datadog/browser-core'
import {
  noop,
  CustomerDataType,
  willSyntheticsInjectRum,
  assign,
  BoundedBuffer,
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
  checkUser,
  sanitizeUser,
  sanitize,
  createStoredContextManager,
  combine,
} from '@datadog/browser-core'
import type { LifeCycle } from '../domain/lifeCycle'
import type { ViewContexts } from '../domain/contexts/viewContexts'
import type { RumSessionManager } from '../domain/rumSessionManager'
import type { ReplayStats } from '../rawRumEvent.types'
import { ActionType } from '../rawRumEvent.types'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import { validateAndBuildRumConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import { buildCommonContext } from '../domain/contexts/commonContext'
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
  getSessionReplayLink: (
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewContexts: ViewContexts
  ) => string | undefined
}
interface RumPublicApiOptions {
  ignoreInitIfSyntheticsWillInjectRum?: boolean
}

const RUM_STORAGE_KEY = 'rum'

export function makeRumPublicApi(
  startRumImpl: StartRum,
  recorderApi: RecorderApi,
  { ignoreInitIfSyntheticsWillInjectRum = true }: RumPublicApiOptions = {}
) {
  let isAlreadyInitialized = false

  let globalContextManager = createContextManager(CustomerDataType.GlobalContext)
  let userContextManager = createContextManager(CustomerDataType.User)

  let getInternalContextStrategy: StartRumResult['getInternalContext'] = () => undefined
  let getInitConfigurationStrategy = (): InitConfiguration | undefined => undefined
  let stopSessionStrategy: () => void = noop
  let getSessionReplayLinkStrategy: () => string | undefined = () => undefined

  let bufferApiCalls = new BoundedBuffer()
  let addTimingStrategy: StartRumResult['addTiming'] = (name, time = timeStampNow()) => {
    bufferApiCalls.add(() => addTimingStrategy(name, time))
  }
  let startViewStrategy: StartRumResult['startView'] = (options, startClocks = clocksNow()) => {
    bufferApiCalls.add(() => startViewStrategy(options, startClocks))
  }
  let addActionStrategy: StartRumResult['addAction'] = (
    action,
    commonContext = buildCommonContext(globalContextManager, userContextManager, recorderApi)
  ) => {
    bufferApiCalls.add(() => addActionStrategy(action, commonContext))
  }
  let addErrorStrategy: StartRumResult['addError'] = (
    providedError,
    commonContext = buildCommonContext(globalContextManager, userContextManager, recorderApi)
  ) => {
    bufferApiCalls.add(() => addErrorStrategy(providedError, commonContext))
  }

  let addFeatureFlagEvaluationStrategy: StartRumResult['addFeatureFlagEvaluation'] = (key: string, value: any) => {
    bufferApiCalls.add(() => addFeatureFlagEvaluationStrategy(key, value))
  }

  function initRum(initConfiguration: RumInitConfiguration) {
    if (!initConfiguration) {
      display.error('Missing configuration')
      return
    }
    // This function should be available, regardless of initialization success.
    getInitConfigurationStrategy = () => deepClone<InitConfiguration>(initConfiguration)

    // If we are in a Synthetics test configured to automatically inject a RUM instance, we want to
    // completely discard the customer application RUM instance by ignoring their init() call.  But,
    // we should not ignore the init() call from the Synthetics-injected RUM instance, so the
    // internal `ignoreInitIfSyntheticsWillInjectRum` option is here to bypass this condition.
    if (ignoreInitIfSyntheticsWillInjectRum && willSyntheticsInjectRum()) {
      return
    }

    const eventBridgeAvailable = canUseEventBridge()
    if (eventBridgeAvailable) {
      initConfiguration = overrideInitConfigurationForBridge(initConfiguration)
    }

    if (!canInitRum(initConfiguration)) {
      return
    }

    const configuration = validateAndBuildRumConfiguration(initConfiguration)
    if (!configuration) {
      return
    }

    if (!eventBridgeAvailable && !configuration.sessionStoreStrategyType) {
      display.warn('No storage available for session. We will not send any data.')
      return
    }

    if (!configuration.trackViewsManually) {
      doStartRum(initConfiguration, configuration)
    } else {
      // drain beforeInitCalls by buffering them until we start RUM
      // if we get a startView, drain re-buffered calls before continuing to drain beforeInitCalls
      // in order to ensure that calls are processed in order
      const beforeInitCalls = bufferApiCalls
      bufferApiCalls = new BoundedBuffer()

      startViewStrategy = (options) => {
        doStartRum(initConfiguration, configuration, options)
      }
      beforeInitCalls.drain()
    }

    isAlreadyInitialized = true
  }

  function doStartRum(
    initConfiguration: RumInitConfiguration,
    configuration: RumConfiguration,
    initialViewOptions?: ViewOptions
  ) {
    if (initConfiguration.storeContextsAcrossPages) {
      const beforeInitGlobalContext = globalContextManager.getContext()
      globalContextManager = createStoredContextManager(configuration, RUM_STORAGE_KEY, CustomerDataType.GlobalContext)
      globalContextManager.setContext(combine(globalContextManager.getContext(), beforeInitGlobalContext))

      const beforeInitUserContext = userContextManager.getContext()
      userContextManager = createStoredContextManager(configuration, RUM_STORAGE_KEY, CustomerDataType.User)
      userContextManager.setContext(combine(userContextManager.getContext(), beforeInitUserContext))
    }

    const startRumResults = startRumImpl(
      initConfiguration,
      configuration,
      recorderApi,
      globalContextManager,
      userContextManager,
      initialViewOptions
    )
    getSessionReplayLinkStrategy = () =>
      recorderApi.getSessionReplayLink(configuration, startRumResults.session, startRumResults.viewContexts)
    ;({
      startView: startViewStrategy,
      addAction: addActionStrategy,
      addError: addErrorStrategy,
      addTiming: addTimingStrategy,
      addFeatureFlagEvaluation: addFeatureFlagEvaluationStrategy,
      getInternalContext: getInternalContextStrategy,
      stopSession: stopSessionStrategy,
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
    addRumGlobalContext: monitor((key, value) => globalContextManager.add(key, value)),
    setGlobalContextProperty: monitor((key, value) => globalContextManager.setContextProperty(key, value)),

    /** @deprecated: use removeGlobalContextProperty instead */
    removeRumGlobalContext: monitor((key) => globalContextManager.remove(key)),
    removeGlobalContextProperty: monitor((key) => globalContextManager.removeContextProperty(key)),

    /** @deprecated: use getGlobalContext instead */
    getRumGlobalContext: monitor(() => globalContextManager.get()),
    getGlobalContext: monitor(() => globalContextManager.getContext()),

    /** @deprecated: use setGlobalContext instead */
    setRumGlobalContext: monitor((context) => globalContextManager.set(context)),
    setGlobalContext: monitor((context) => globalContextManager.setContext(context)),

    clearGlobalContext: monitor(() => globalContextManager.clearContext()),

    getInternalContext: monitor((startTime?: number) => getInternalContextStrategy(startTime)),
    getInitConfiguration: monitor(() => getInitConfigurationStrategy()),

    addAction: monitor((name: string, context?: object) => {
      addActionStrategy({
        name: sanitize(name)!,
        context: sanitize(context) as Context,
        startClocks: clocksNow(),
        type: ActionType.CUSTOM,
      })
    }),

    addError: (error: unknown, context?: object) => {
      const handlingStack = createHandlingStack()
      callMonitored(() => {
        addErrorStrategy({
          error, // Do not sanitize error here, it is needed unserialized by computeRawError()
          handlingStack,
          context: sanitize(context) as Context,
          startClocks: clocksNow(),
        })
      })
    },

    addTiming: monitor((name: string, time?: number) => {
      addTimingStrategy(sanitize(name)!, time as RelativeTime | TimeStamp | undefined)
    }),

    setUser: monitor((newUser: User) => {
      if (checkUser(newUser)) {
        userContextManager.setContext(sanitizeUser(newUser as Context))
      }
    }),

    getUser: monitor(() => userContextManager.getContext()),

    setUserProperty: monitor((key, property) => {
      const sanitizedProperty = sanitizeUser({ [key]: property })[key]
      userContextManager.setContextProperty(key, sanitizedProperty)
    }),

    removeUserProperty: monitor((key) => userContextManager.removeContextProperty(key)),

    /** @deprecated: renamed to clearUser */
    removeUser: monitor(() => userContextManager.clearContext()),
    clearUser: monitor(() => userContextManager.clearContext()),

    startView,

    stopSession: monitor(() => {
      stopSessionStrategy()
    }),

    startSessionReplayRecording: monitor(recorderApi.start),
    stopSessionReplayRecording: monitor(recorderApi.stop),

    /**
     * This feature is currently in beta. For more information see the full [feature flag tracking guide](https://docs.datadoghq.com/real_user_monitoring/feature_flag_tracking/).
     */
    addFeatureFlagEvaluation: monitor((key: string, value: any) => {
      addFeatureFlagEvaluationStrategy(sanitize(key)!, sanitize(value))
    }),
    getSessionReplayLink: monitor(() => getSessionReplayLinkStrategy()),
  })

  return rumPublicApi

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
      sessionSampleRate: 100,
    })
  }
}
