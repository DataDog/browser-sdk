import type {
  Context,
  TimeStamp,
  RelativeTime,
  User,
  DeflateWorker,
  DeflateEncoderStreamId,
  DeflateEncoder,
  TrackingConsent,
  PublicApi,
} from '@datadog/browser-core'
import {
  addTelemetryUsage,
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
import type { InternalContext } from '../domain/contexts/internalContext'
import { createPreStartStrategy } from './preStartRum'
import type { StartRum, StartRumResult } from './startRum'

export interface StartRecordingOptions {
  force: boolean
}
export interface RumPublicApi extends PublicApi {
  /**
   * Init the RUM browser SDK.
   * @param initConfiguration Configuration options of the SDK
   *
   * See [RUM Browser Monitoring Setup](https://docs.datadoghq.com/real_user_monitoring/browser) for further information.
   */
  init: (initConfiguration: RumInitConfiguration) => void

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
   *
   * See [User tracking consent](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-tracking-consent) for further information.
   */
  setTrackingConsent: (trackingConsent: TrackingConsent) => void
  /**
   * Set the global context information to all events, stored in `@context`
   *
   * @param context Global context
   *
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   */
  setGlobalContext: (context: any) => void

  /**
   * Get the global Context
   *
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   */
  getGlobalContext: () => Context

  /**
   * Set or update a global context property, stored in `@context.<key>`
   *
   * @param key Key of the property
   * @param property Value of the property
   *
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   */
  setGlobalContextProperty: (key: any, value: any) => void

  /**
   * Remove a global context property
   *
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   */
  removeGlobalContextProperty: (key: any) => void

  /**
   * Clear the global context
   *
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   */
  clearGlobalContext: () => void

  /**
   * [Internal API] Get the internal SDK context
   */
  getInternalContext: (startTime?: number) => InternalContext | undefined

  /**
   * Get the init configuration
   */
  getInitConfiguration: () => RumInitConfiguration | undefined

  /**
   * Add a custom action, stored in `@action`
   * @param name Name of the action
   * @param context Context of the action
   *
   * See [Send RUM Custom Actions](https://docs.datadoghq.com/real_user_monitoring/guide/send-rum-custom-actions) for further information.
   */
  addAction: (name: string, context?: object) => void

  /**
   * Add a custom error, stored in `@error`.
   * @param error Error. Favor sending a [Javascript Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) to have a stack trace attached to the error event.
   * @param context Context of the error
   *
   * See [Send RUM Custom Actions](https://docs.datadoghq.com/real_user_monitoring/guide/send-rum-custom-actions) for further information.
   */
  addError: (error: unknown, context?: object) => void

  /**
   * Add a custom timing relative to the start of the current view,
   * stored in `@view.custom_timings.<timing_name>`
   *
   * @param name Name of the custom timing
   * @param [time] Epoch timestamp of the custom timing (if not set, will use current time)
   *
   * Note: passing a relative time is discouraged since it is actually used as-is but displayed relative to the view start.
   * We currently don't provide a way to retrieve the view start time, so it can be challenging to provide a timing relative to the view start.
   * see https://github.com/DataDog/browser-sdk/issues/2552
   */
  addTiming: (name: string, time?: number) => void

  /**
   * Set user information to all events, stored in `@usr`
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   */
  setUser: (newUser: User) => void

  /**
   * Get user information
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   */
  getUser: () => Context

  /**
   * Set or update the user property, stored in `@usr.<key>`
   *
   * @param key Key of the property
   * @param property Value of the property
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   */
  setUserProperty: (key: any, property: any) => void

  /**
   * Remove a user property
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   */
  removeUserProperty: (key: any) => void

  /**
   * Clear all user information
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   */
  clearUser: () => void

  /**
   * Start a view manually.
   * Enable to manual start a view, use `trackViewManually: true` init parameter and call `startView()` to create RUM views and be aligned with how you’ve defined them in your SPA application routing.
   *
   * @param options.name name of the view
   * @param options.service service of the view
   * @param options.version version of the view
   *
   * See [Override default RUM view names](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#override-default-rum-view-names) for further information.
   */
  startView: {
    (name?: string): void
    (options: ViewOptions): void
  }

  /**
   * Stop the session. A new session will start at the next user interaction with the page.
   */
  stopSession: () => void

  /**
   * Add a feature flag evaluation,
   * stored in `@feature_flags.<feature_flag_key>`
   *
   * @param {string} key The key of the feature flag.
   * @param {any} value The value of the feature flag.
   *
   * We recommend enabling the intake request compression when using feature flags `compressIntakeRequests: true`.
   *
   * See [Feature Flag Tracking](https://docs.datadoghq.com/real_user_monitoring/feature_flag_tracking/) for further information.
   */
  addFeatureFlagEvaluation: (key: string, value: any) => void

  /**
   * Get the Session Replay Link.
   *
   * See [Connect Session Replay To Your Third-Party Tools](https://docs.datadoghq.com/real_user_monitoring/guide/connect-session-replay-to-your-third-party-tools) for further information.
   */
  getSessionReplayLink: () => string | undefined

  /**
   * Start Session Replay recording.
   * Enable to conditionally start the recording, use the `startSessionReplayRecordingManually:true` init parameter and call `startSessionReplayRecording()`
   *
   * See [Browser Session Replay](https://docs.datadoghq.com/real_user_monitoring/session_replay/browser) for further information.
   */
  startSessionReplayRecording: (options?: StartRecordingOptions) => void

  /**
   * Stop Session Replay recording.
   *
   * See [Browser Session Replay](https://docs.datadoghq.com/real_user_monitoring/session_replay/browser) for further information.
   */
  stopSessionReplayRecording: () => void
}

export interface RecorderApi {
  start: (options?: StartRecordingOptions) => void
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
  init: (initConfiguration: RumInitConfiguration, publicApi: RumPublicApi) => void
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

export function makeRumPublicApi(
  startRumImpl: StartRum,
  recorderApi: RecorderApi,
  options: RumPublicApiOptions = {}
): RumPublicApi {
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

    (configuration, deflateWorker, initialViewOptions) => {
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
            addTelemetryUsage({ feature: 'start-duration-vital' })
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

      if (configuration.storeContextsAcrossPages) {
        storeContextManager(configuration, globalContextManager, RUM_STORAGE_KEY, CustomerDataType.GlobalContext)
        storeContextManager(configuration, userContextManager, RUM_STORAGE_KEY, CustomerDataType.User)
      }

      customerDataTrackerManager.setCompressionStatus(
        deflateWorker ? CustomerDataCompressionStatus.Enabled : CustomerDataCompressionStatus.Disabled
      )

      const startRumResult = startRumImpl(
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

      recorderApi.onRumStart(
        startRumResult.lifeCycle,
        configuration,
        startRumResult.session,
        startRumResult.viewContexts,
        deflateWorker
      )

      strategy = createPostStartStrategy(strategy, startRumResult)

      return startRumResult
    }
  )

  const startView: {
    (name?: string): void
    (options: ViewOptions): void
  } = monitor((options?: string | ViewOptions) => {
    const sanitizedOptions = typeof options === 'object' ? options : { name: options }
    strategy.startView(sanitizedOptions)
    addTelemetryUsage({ feature: 'start-view' })
  })
  const rumPublicApi: RumPublicApi = makePublicApi<RumPublicApi>({
    init: monitor((initConfiguration) => strategy.init(initConfiguration, rumPublicApi)),

    setTrackingConsent: monitor((trackingConsent) => {
      trackingConsentState.update(trackingConsent)
      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: trackingConsent })
    }),

    setGlobalContext: monitor((context) => {
      globalContextManager.setContext(context)
      addTelemetryUsage({ feature: 'set-global-context' })
    }),

    getGlobalContext: monitor(() => globalContextManager.getContext()),

    setGlobalContextProperty: monitor((key, value) => {
      globalContextManager.setContextProperty(key, value)
      addTelemetryUsage({ feature: 'set-global-context' })
    }),

    removeGlobalContextProperty: monitor((key) => globalContextManager.removeContextProperty(key)),

    clearGlobalContext: monitor(() => globalContextManager.clearContext()),

    getInternalContext: monitor((startTime) => strategy.getInternalContext(startTime)),

    getInitConfiguration: monitor(() => deepClone(strategy.initConfiguration)),

    addAction: (name, context) => {
      const handlingStack = createHandlingStack()

      callMonitored(() => {
        strategy.addAction({
          name: sanitize(name)!,
          context: sanitize(context) as Context,
          startClocks: clocksNow(),
          type: ActionType.CUSTOM,
          handlingStack,
        })
        addTelemetryUsage({ feature: 'add-action' })
      })
    },

    addError: (error, context) => {
      const handlingStack = createHandlingStack()
      callMonitored(() => {
        strategy.addError({
          error, // Do not sanitize error here, it is needed unserialized by computeRawError()
          handlingStack,
          context: sanitize(context) as Context,
          startClocks: clocksNow(),
        })
        addTelemetryUsage({ feature: 'add-error' })
      })
    },

    addTiming: monitor((name, time) => {
      // TODO: next major decide to drop relative time support or update its behaviour
      strategy.addTiming(sanitize(name)!, time as RelativeTime | TimeStamp | undefined)
    }),

    setUser: monitor((newUser) => {
      if (checkUser(newUser)) {
        userContextManager.setContext(sanitizeUser(newUser as Context))
      }
      addTelemetryUsage({ feature: 'set-user' })
    }),

    getUser: monitor(() => userContextManager.getContext()),

    setUserProperty: monitor((key, property) => {
      const sanitizedProperty = sanitizeUser({ [key]: property })[key]
      userContextManager.setContextProperty(key, sanitizedProperty)
      addTelemetryUsage({ feature: 'set-user' })
    }),

    removeUserProperty: monitor((key) => userContextManager.removeContextProperty(key)),

    clearUser: monitor(() => userContextManager.clearContext()),

    startView,

    stopSession: monitor(() => {
      strategy.stopSession()
      addTelemetryUsage({ feature: 'stop-session' })
    }),

    addFeatureFlagEvaluation: monitor((key, value) => {
      strategy.addFeatureFlagEvaluation(sanitize(key)!, sanitize(value))
      addTelemetryUsage({ feature: 'add-feature-flag-evaluation' })
    }),

    getSessionReplayLink: monitor(() => recorderApi.getSessionReplayLink()),
    startSessionReplayRecording: monitor((options?: StartRecordingOptions) => {
      recorderApi.start(options)
      addTelemetryUsage({ feature: 'start-session-replay-recording', force: options?.force })
    }),

    stopSessionReplayRecording: monitor(() => recorderApi.stop()),
  })

  return rumPublicApi
}

function createPostStartStrategy(preStartStrategy: Strategy, startRumResult: StartRumResult): Strategy {
  return assign(
    {
      init: (initConfiguration: RumInitConfiguration) => {
        displayAlreadyInitializedError('DD_RUM', initConfiguration)
      },
      initConfiguration: preStartStrategy.initConfiguration,
    },
    startRumResult
  )
}
