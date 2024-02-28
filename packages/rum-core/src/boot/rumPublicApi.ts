import type {
  Context,
  TimeStamp,
  RelativeTime,
  User,
  DeflateWorker,
  DeflateEncoderStreamId,
  DeflateEncoder,
  TrackingConsent,
} from '@datadog/browser-core'
import {
  timeStampToClocks,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
  CustomerDataType,
  assign,
  createContextManager,
  deepClone,
  makePublicApi,
  monitor,
  clocksNow,
  callMonitored,
  createHandlingStack,
  checkUser,
  sanitizeUser,
  sanitize,
  createIdentityEncoder,
  CustomerDataCompressionStatus,
  createCustomerDataTrackerManager,
  storeContextManager,
  displayAlreadyInitializedError,
  createTrackingConsentState,
} from '@datadog/browser-core'
import type { LifeCycle } from '../domain/lifeCycle'
import type { ViewContexts } from '../domain/contexts/viewContexts'
import type { RumSessionManager } from '../domain/rumSessionManager'
import type { ReplayStats } from '../rawRumEvent.types'
import { ActionType } from '../rawRumEvent.types'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import { buildCommonContext } from '../domain/contexts/commonContext'
import { createPreStartStrategy } from './preStartRum'
import type { StartRum, StartRumResult } from './startRum'

export type RumPublicApi = ReturnType<typeof makeRumPublicApi>

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
  getSessionReplayLink: () => string | undefined
}

export interface RumPublicApiOptions {
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

export interface Strategy {
  init: (initConfiguration: RumInitConfiguration) => void
  initConfiguration: RumInitConfiguration | undefined
  getInternalContext: StartRumResult['getInternalContext']
  stopSession: StartRumResult['stopSession']
  addTiming: StartRumResult['addTiming']
  startView: StartRumResult['startView']
  addAction: StartRumResult['addAction']
  addError: StartRumResult['addError']
  addFeatureFlagEvaluation: StartRumResult['addFeatureFlagEvaluation']
  startDurationVital: StartRumResult['startDurationVital']
  stopDurationVital: StartRumResult['stopDurationVital']
}

export function makeRumPublicApi(startRumImpl: StartRum, recorderApi: RecorderApi, options: RumPublicApiOptions = {}) {
  const customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Unknown)
  const globalContextManager = createContextManager(
    customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext)
  )
  const userContextManager = createContextManager(customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User))
  const trackingConsentState = createTrackingConsentState()

  function getCommonContext() {
    return buildCommonContext(globalContextManager, userContextManager, recorderApi)
  }

  let strategy = createPreStartStrategy(
    options,
    getCommonContext,
    trackingConsentState,

    (initConfiguration, configuration, deflateWorker, initialViewOptions) => {
      if (isExperimentalFeatureEnabled(ExperimentalFeature.CUSTOM_VITALS)) {
        /**
         * Start a custom duration vital
         * stored in @vital.custom.<name>
         *
         * @param name name of the custom vital
         * @param options.context custom context attached to the vital
         * @param options.startTime epoch timestamp of the start of the custom vital (if not set, will use current time)
         */
        ;(rumPublicApi as any).startDurationVital = monitor(
          (name: string, options?: { context?: object; startTime?: number }) => {
            strategy.startDurationVital({
              name: sanitize(name)!,
              startClocks: options?.startTime ? timeStampToClocks(options.startTime as TimeStamp) : clocksNow(),
              context: sanitize(options?.context) as Context,
            })
          }
        )

        /**
         * Stop a custom duration vital
         * stored in @vital.custom.<name>
         *
         * @param name name of the custom vital
         * @param options.context custom context attached to the vital
         * @param options.stopTime epoch timestamp of the stop of the custom vital (if not set, will use current time)
         */
        ;(rumPublicApi as any).stopDurationVital = monitor(
          (name: string, options?: { context?: object; stopTime?: number }) => {
            strategy.stopDurationVital({
              name: sanitize(name)!,
              stopClocks: options?.stopTime ? timeStampToClocks(options.stopTime as TimeStamp) : clocksNow(),
              context: sanitize(options?.context) as Context,
            })
          }
        )
      }

      if (initConfiguration.storeContextsAcrossPages) {
        storeContextManager(configuration, globalContextManager, RUM_STORAGE_KEY, CustomerDataType.GlobalContext)
        storeContextManager(configuration, userContextManager, RUM_STORAGE_KEY, CustomerDataType.User)
      }

      customerDataTrackerManager.setCompressionStatus(
        deflateWorker ? CustomerDataCompressionStatus.Enabled : CustomerDataCompressionStatus.Disabled
      )

      const startRumResult = startRumImpl(
        initConfiguration,
        configuration,
        recorderApi,
        customerDataTrackerManager,
        getCommonContext,
        initialViewOptions,
        deflateWorker && options.createDeflateEncoder
          ? (streamId) => options.createDeflateEncoder!(configuration, deflateWorker, streamId)
          : createIdentityEncoder,
        trackingConsentState
      )

      ;(rumPublicApi as any).meterProvider = startRumResult.defaultMeterProvider

      recorderApi.onRumStart(
        startRumResult.lifeCycle,
        configuration,
        startRumResult.session,
        startRumResult.viewContexts,
        deflateWorker
      )

      strategy = createPostStartStrategy(initConfiguration, startRumResult)

      return startRumResult
    }
  )

  const startView: {
    (name?: string): void
    (options: ViewOptions): void
  } = monitor((options?: string | ViewOptions) => {
    const sanitizedOptions = typeof options === 'object' ? options : { name: options }
    strategy.startView(sanitizedOptions)
  })

  const rumPublicApi = makePublicApi({
    init: monitor((initConfiguration: RumInitConfiguration) => strategy.init(initConfiguration)),

    /**
     * Set the tracking consent of the current user.
     *
     * @param {"granted" | "not-granted"} trackingConsent The user tracking consent
     *
     * Data will be sent only if it is set to "granted". This value won't be stored by the library
     * across page loads: you will need to call this method or set the appropriate `trackingConsent`
     * field in the init() method at each page load.
     *
     * If this method is called before the init() method, the provided value will take precedence
     * over the one provided as initialization parameter.
     */
    setTrackingConsent: monitor((trackingConsent: TrackingConsent) => trackingConsentState.update(trackingConsent)),

    setGlobalContextProperty: monitor((key, value) => globalContextManager.setContextProperty(key, value)),

    removeGlobalContextProperty: monitor((key) => globalContextManager.removeContextProperty(key)),

    getGlobalContext: monitor(() => globalContextManager.getContext()),

    setGlobalContext: monitor((context) => globalContextManager.setContext(context)),

    clearGlobalContext: monitor(() => globalContextManager.clearContext()),

    getInternalContext: monitor((startTime?: number) => strategy.getInternalContext(startTime)),

    getInitConfiguration: monitor(() => deepClone(strategy.initConfiguration)),

    addAction: monitor((name: string, context?: object) => {
      strategy.addAction({
        name: sanitize(name)!,
        context: sanitize(context) as Context,
        startClocks: clocksNow(),
        type: ActionType.CUSTOM,
      })
    }),

    addError: (error: unknown, context?: object) => {
      const handlingStack = createHandlingStack()
      callMonitored(() => {
        strategy.addError({
          error, // Do not sanitize error here, it is needed unserialized by computeRawError()
          handlingStack,
          context: sanitize(context) as Context,
          startClocks: clocksNow(),
        })
      })
    },

    /**
     * Add a custom timing relative to the start of the current view,
     * stored in @view.custom_timings.<timing_name>
     *
     * @param name name of the custom timing
     * @param [time] epoch timestamp of the custom timing (if not set, will use current time)
     *
     * Note: passing a relative time is discouraged since it is actually used as-is but displayed relative to the view start.
     * We currently don't provide a way to retrieve the view start time, so it can be challenging to provide a timing relative to the view start.
     * see https://github.com/DataDog/browser-sdk/issues/2552
     */
    addTiming: monitor((name: string, time?: number) => {
      // TODO: next major decide to drop relative time support or update its behaviour
      strategy.addTiming(sanitize(name)!, time as RelativeTime | TimeStamp | undefined)
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
      strategy.stopSession()
    }),

    /**
     * This feature is currently in beta. For more information see the full [feature flag tracking guide](https://docs.datadoghq.com/real_user_monitoring/feature_flag_tracking/).
     */
    addFeatureFlagEvaluation: monitor((key: string, value: any) => {
      strategy.addFeatureFlagEvaluation(sanitize(key)!, sanitize(value))
    }),

    getSessionReplayLink: monitor(() => recorderApi.getSessionReplayLink()),
    startSessionReplayRecording: monitor(() => recorderApi.start()),
    stopSessionReplayRecording: monitor(() => recorderApi.stop()),
  })

  return rumPublicApi
}

function createPostStartStrategy(initConfiguration: RumInitConfiguration, startRumResult: StartRumResult): Strategy {
  return assign(
    {
      init: (initConfiguration: RumInitConfiguration) => {
        displayAlreadyInitializedError('DD_RUM', initConfiguration)
      },
      initConfiguration,
    },
    startRumResult
  )
}
