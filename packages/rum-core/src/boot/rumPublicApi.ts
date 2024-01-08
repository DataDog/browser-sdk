import type {
  Context,
  InitConfiguration,
  TimeStamp,
  RelativeTime,
  User,
  DeflateWorker,
  DeflateEncoderStreamId,
  DeflateEncoder,
} from '@datadog/browser-core'
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
  createIdentityEncoder,
  CustomerDataCompressionStatus,
  createCustomerDataTrackerManager,
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
    viewContexts: ViewContexts,
    deflateWorker: DeflateWorker | undefined
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
  startDeflateWorker?: (
    configuration: RumConfiguration,
    source: string,
    onInitializationFailure: () => void
  ) => DeflateWorker | undefined
  createDeflateEncoder?: (
    configuration: RumConfiguration,
    worker: DeflateWorker,
    streamId: DeflateEncoderStreamId
  ) => DeflateEncoder
}

const RUM_STORAGE_KEY = 'rum'

export function makeRumPublicApi(
  startRumImpl: StartRum,
  recorderApi: RecorderApi,
  { ignoreInitIfSyntheticsWillInjectRum = true, startDeflateWorker, createDeflateEncoder }: RumPublicApiOptions = {}
) {
  let isAlreadyInitialized = false

  const customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Unknown)
  let globalContextManager = createContextManager(
    customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext)
  )
  let userContextManager = createContextManager(customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User))

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

  let recorderStartStrategy: typeof recorderApi.start = () => {
    bufferApiCalls.add(() => recorderStartStrategy())
  }

  let recorderStopStrategy: typeof recorderApi.stop = () => {
    bufferApiCalls.add(() => recorderStopStrategy())
  }

  let addFeatureFlagEvaluationStrategy: StartRumResult['addFeatureFlagEvaluation'] = (key: string, value: any) => {
    bufferApiCalls.add(() => addFeatureFlagEvaluationStrategy(key, value))
  }

  let deflateWorker: DeflateWorker | undefined

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

    if (configuration.compressIntakeRequests && !eventBridgeAvailable && startDeflateWorker) {
      deflateWorker = startDeflateWorker(
        configuration,
        'Datadog RUM',
        // Worker initialization can fail asynchronously, especially in Firefox where even CSP
        // issues are reported asynchronously. For now, the SDK will continue its execution even if
        // data won't be sent to Datadog. We could improve this behavior in the future.
        noop
      )
      if (!deflateWorker) {
        // `startDeflateWorker` should have logged an error message explaining the issue
        return
      }
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
      globalContextManager = createStoredContextManager(
        configuration,
        RUM_STORAGE_KEY,
        CustomerDataType.GlobalContext,
        customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext)
      )
      globalContextManager.setContext(combine(globalContextManager.getContext(), beforeInitGlobalContext))

      const beforeInitUserContext = userContextManager.getContext()
      userContextManager = createStoredContextManager(
        configuration,
        RUM_STORAGE_KEY,
        CustomerDataType.User,
        customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User)
      )
      userContextManager.setContext(combine(userContextManager.getContext(), beforeInitUserContext))
    }

    customerDataTrackerManager.setCompressionStatus(
      deflateWorker ? CustomerDataCompressionStatus.Enabled : CustomerDataCompressionStatus.Disabled
    )

    const startRumResults = startRumImpl(
      initConfiguration,
      configuration,
      recorderApi,
      customerDataTrackerManager,
      globalContextManager,
      userContextManager,
      initialViewOptions,
      deflateWorker && createDeflateEncoder
        ? (streamId) => createDeflateEncoder(configuration, deflateWorker!, streamId)
        : createIdentityEncoder
    )
    getSessionReplayLinkStrategy = () =>
      recorderApi.getSessionReplayLink(configuration, startRumResults.session, startRumResults.viewContexts)
    recorderStartStrategy = recorderApi.start
    recorderStopStrategy = recorderApi.stop
    ;({
      startView: startViewStrategy,
      addAction: addActionStrategy,
      addError: addErrorStrategy,
      addTiming: addTimingStrategy,
      addFeatureFlagEvaluation: addFeatureFlagEvaluationStrategy,
      getInternalContext: getInternalContextStrategy,
      stopSession: stopSessionStrategy,
    } = startRumResults)

    recorderApi.onRumStart(
      startRumResults.lifeCycle,
      configuration,
      startRumResults.session,
      startRumResults.viewContexts,
      deflateWorker
    )
    bufferApiCalls.drain()
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

    setGlobalContextProperty: monitor((key, value) => globalContextManager.setContextProperty(key, value)),

    removeGlobalContextProperty: monitor((key) => globalContextManager.removeContextProperty(key)),

    getGlobalContext: monitor(() => globalContextManager.getContext()),

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

    clearUser: monitor(() => userContextManager.clearContext()),

    startView,

    stopSession: monitor(() => {
      stopSessionStrategy()
    }),

    startSessionReplayRecording: monitor(() => recorderStartStrategy()),
    stopSessionReplayRecording: monitor(() => recorderStopStrategy()),

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
