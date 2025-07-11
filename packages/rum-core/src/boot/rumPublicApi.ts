import type {
  Context,
  TimeStamp,
  RelativeTime,
  User,
  Account,
  DeflateWorker,
  DeflateEncoderStreamId,
  DeflateEncoder,
  TrackingConsent,
  PublicApi,
  Duration,
  ContextManager,
} from '@datadog/browser-core'
import {
  ContextManagerMethod,
  addTelemetryUsage,
  deepClone,
  makePublicApi,
  monitor,
  clocksNow,
  callMonitored,
  createHandlingStack,
  sanitize,
  createIdentityEncoder,
  displayAlreadyInitializedError,
  createTrackingConsentState,
  timeStampToClocks,
  CustomerContextKey,
  defineContextMethod,
} from '@datadog/browser-core'

import type { LifeCycle } from '../domain/lifeCycle'
import type { ViewHistory } from '../domain/contexts/viewHistory'
import type { RumSessionManager } from '../domain/rumSessionManager'
import type { ReplayStats } from '../rawRumEvent.types'
import { ActionType, VitalType } from '../rawRumEvent.types'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import type { InternalContext } from '../domain/contexts/internalContext'
import type { DurationVitalReference } from '../domain/vital/vitalCollection'
import { createCustomVitalsState } from '../domain/vital/vitalCollection'
import { callPluginsMethod } from '../domain/plugins'
import type { Hooks } from '../domain/hooks'
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
   * Set View Name.
   *
   * Enable to manually change the name of the current view.
   * @param name name of the view
   * See [Override default RUM view names](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#override-default-rum-view-names) for further information.
   */
  setViewName: (name: string) => void

  /**
   * Set View Context.
   *
   * Enable to manually set the context of the current view.
   * @param context context of the view
   */
  setViewContext: (context: Context) => void
  /**
   * Set View Context Property.
   *
   * Enable to manually set a property of the context of the current view.
   * @param key key of the property
   * @param value value of the property
   */
  setViewContextProperty: (key: string, value: any) => void

  /**
   * Get View Context.
   */
  getViewContext: () => Context

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
  setUser(newUser: User & { id: string }): void

  /**
   * Set user information to all events, stored in `@usr`
   *
   * @deprecated You must specify a user id
   * @see {@link setUser}
   */
  setUser(newUser: User): void
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
   * Set account information to all events, stored in `@account`
   */
  setAccount: (newAccount: Account) => void

  /**
   * Get account information
   */
  getAccount: () => Context

  /**
   * Set or update the account property, stored in `@account.<key>`
   *
   * @param key Key of the property
   * @param property Value of the property
   */
  setAccountProperty: (key: string, property: any) => void

  /**
   * Remove an account property
   */
  removeAccountProperty: (key: string) => void

  /**
   * Clear all account information
   */
  clearAccount: () => void

  /**
   * Start a view manually.
   * Enable to manual start a view, use `trackViewsManually: true` init parameter and call `startView()` to create RUM views and be aligned with how you’ve defined them in your SPA application routing.
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

  /**
   * Add a custom duration vital
   *
   * @param name name of the custom vital
   * @param options.startTime epoch timestamp of the start of the custom vital
   * @param options.duration duration of the custom vital in millisecond
   * @param options.context custom context attached to the vital
   * @param options.description  Description of the vital
   */
  addDurationVital: (
    name: string,
    options: { startTime: number; duration: number; context?: object; description?: string }
  ) => void

  /**
   * Start a custom duration vital.
   *
   * If you plan to have multiple durations for the same vital, you should use the reference returned by this method.
   *
   * @param name name of the custom vital
   * @param options.context custom context attached to the vital
   * @param options.description Description of the vital
   * @returns reference to the custom vital
   */
  startDurationVital: (name: string, options?: { context?: object; description?: string }) => DurationVitalReference

  /**
   * Stop a custom duration vital
   *
   * @param nameOrRef name of the custom vital or the reference to it
   * @param options.context custom context attached to the vital
   * @param options.description Description of the vital
   */
  stopDurationVital: (
    nameOrRef: string | DurationVitalReference,
    options?: { context?: object; description?: string }
  ) => void
}

export interface RecorderApi {
  start: (options?: StartRecordingOptions) => void
  stop: () => void
  onRumStart: (
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory,
    deflateWorker: DeflateWorker | undefined
  ) => void
  isRecording: () => boolean
  getReplayStats: (viewId: string) => ReplayStats | undefined
  getSessionReplayLink: () => string | undefined
}

export interface ProfilerApi {
  stop: () => void
  onRumStart: (
    lifeCycle: LifeCycle,
    hooks: Hooks,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory
  ) => void
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
  sdkName?: 'rum' | 'rum-slim' | 'rum-synthetics'
}

export interface Strategy {
  init: (initConfiguration: RumInitConfiguration, publicApi: RumPublicApi) => void
  initConfiguration: RumInitConfiguration | undefined
  getInternalContext: StartRumResult['getInternalContext']
  stopSession: StartRumResult['stopSession']
  addTiming: StartRumResult['addTiming']
  startView: StartRumResult['startView']
  setViewName: StartRumResult['setViewName']

  setViewContext: StartRumResult['setViewContext']
  setViewContextProperty: StartRumResult['setViewContextProperty']
  getViewContext: StartRumResult['getViewContext']

  globalContext: ContextManager
  userContext: ContextManager
  accountContext: ContextManager

  addAction: StartRumResult['addAction']
  addError: StartRumResult['addError']
  addFeatureFlagEvaluation: StartRumResult['addFeatureFlagEvaluation']
  startDurationVital: StartRumResult['startDurationVital']
  stopDurationVital: StartRumResult['stopDurationVital']
  addDurationVital: StartRumResult['addDurationVital']
}

export function makeRumPublicApi(
  startRumImpl: StartRum,
  recorderApi: RecorderApi,
  profilerApi: ProfilerApi,
  options: RumPublicApiOptions = {}
): RumPublicApi {
  const trackingConsentState = createTrackingConsentState()
  const customVitalsState = createCustomVitalsState()

  let strategy = createPreStartStrategy(
    options,
    trackingConsentState,
    customVitalsState,
    (configuration, deflateWorker, initialViewOptions) => {
      const startRumResult = startRumImpl(
        configuration,
        recorderApi,
        profilerApi,
        initialViewOptions,
        deflateWorker && options.createDeflateEncoder
          ? (streamId) => options.createDeflateEncoder!(configuration, deflateWorker, streamId)
          : createIdentityEncoder,
        trackingConsentState,
        customVitalsState,
        options.sdkName
      )

      recorderApi.onRumStart(
        startRumResult.lifeCycle,
        configuration,
        startRumResult.session,
        startRumResult.viewHistory,
        deflateWorker
      )

      profilerApi.onRumStart(
        startRumResult.lifeCycle,
        startRumResult.hooks,
        configuration,
        startRumResult.session,
        startRumResult.viewHistory
      )

      strategy = createPostStartStrategy(strategy, startRumResult)

      callPluginsMethod(configuration.plugins, 'onRumStart', {
        strategy, // TODO: remove this in the next major release
        addEvent: startRumResult.addEvent,
      })

      return startRumResult
    }
  )
  const getStrategy = () => strategy

  const startView: {
    (name?: string): void
    (options: ViewOptions): void
  } = monitor((options?: string | ViewOptions) => {
    const sanitizedOptions = typeof options === 'object' ? options : { name: options }
    strategy.startView(sanitizedOptions)
    addTelemetryUsage({ feature: 'start-view' })
  })

  const rumPublicApi: RumPublicApi = makePublicApi<RumPublicApi>({
    init: monitor((initConfiguration) => {
      strategy.init(initConfiguration, rumPublicApi)
    }),

    setTrackingConsent: monitor((trackingConsent) => {
      trackingConsentState.update(trackingConsent)
      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: trackingConsent })
    }),

    setViewName: monitor((name: string) => {
      strategy.setViewName(name)
      addTelemetryUsage({ feature: 'set-view-name' })
    }),

    setViewContext: monitor((context: Context) => {
      strategy.setViewContext(context)
      addTelemetryUsage({ feature: 'set-view-context' })
    }),

    setViewContextProperty: monitor((key: string, value: any) => {
      strategy.setViewContextProperty(key, value)
      addTelemetryUsage({ feature: 'set-view-context-property' })
    }),

    getViewContext: monitor(() => {
      addTelemetryUsage({ feature: 'set-view-context-property' })
      return strategy.getViewContext()
    }),

    getInternalContext: monitor((startTime) => strategy.getInternalContext(startTime)),

    getInitConfiguration: monitor(() => deepClone(strategy.initConfiguration)),

    addAction: (name, context) => {
      const handlingStack = createHandlingStack('action')

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
      const handlingStack = createHandlingStack('error')
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

    setGlobalContext: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.setContext,
      'set-global-context'
    ),
    getGlobalContext: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.getContext,
      'get-global-context'
    ),
    setGlobalContextProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.setContextProperty,
      'set-global-context-property'
    ),
    removeGlobalContextProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.removeContextProperty,
      'remove-global-context-property'
    ),
    clearGlobalContext: defineContextMethod(
      getStrategy,
      CustomerContextKey.globalContext,
      ContextManagerMethod.clearContext,
      'clear-global-context'
    ),

    setUser: defineContextMethod(
      getStrategy,
      CustomerContextKey.userContext,
      ContextManagerMethod.setContext,
      'set-user'
    ),
    getUser: defineContextMethod(
      getStrategy,
      CustomerContextKey.userContext,
      ContextManagerMethod.getContext,
      'get-user'
    ),
    setUserProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.userContext,
      ContextManagerMethod.setContextProperty,
      'set-user-property'
    ),
    removeUserProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.userContext,
      ContextManagerMethod.removeContextProperty,
      'remove-user-property'
    ),
    clearUser: defineContextMethod(
      getStrategy,
      CustomerContextKey.userContext,
      ContextManagerMethod.clearContext,
      'clear-user'
    ),

    setAccount: defineContextMethod(
      getStrategy,
      CustomerContextKey.accountContext,
      ContextManagerMethod.setContext,
      'set-account'
    ),
    getAccount: defineContextMethod(
      getStrategy,
      CustomerContextKey.accountContext,
      ContextManagerMethod.getContext,
      'get-account'
    ),
    setAccountProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.accountContext,
      ContextManagerMethod.setContextProperty,
      'set-account-property'
    ),
    removeAccountProperty: defineContextMethod(
      getStrategy,
      CustomerContextKey.accountContext,
      ContextManagerMethod.removeContextProperty,
      'remove-account-property'
    ),
    clearAccount: defineContextMethod(
      getStrategy,
      CustomerContextKey.accountContext,
      ContextManagerMethod.clearContext,
      'clear-account'
    ),

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
      addTelemetryUsage({ feature: 'start-session-replay-recording', force: options && options.force })
    }),

    stopSessionReplayRecording: monitor(() => recorderApi.stop()),

    addDurationVital: monitor((name, options) => {
      addTelemetryUsage({ feature: 'add-duration-vital' })
      strategy.addDurationVital({
        name: sanitize(name)!,
        type: VitalType.DURATION,
        startClocks: timeStampToClocks(options.startTime as TimeStamp),
        duration: options.duration as Duration,
        context: sanitize(options && options.context) as Context,
        description: sanitize(options && options.description) as string | undefined,
      })
    }),

    startDurationVital: monitor((name, options) => {
      addTelemetryUsage({ feature: 'start-duration-vital' })
      return strategy.startDurationVital(sanitize(name)!, {
        context: sanitize(options && options.context) as Context,
        description: sanitize(options && options.description) as string | undefined,
      })
    }),

    stopDurationVital: monitor((nameOrRef, options) => {
      addTelemetryUsage({ feature: 'stop-duration-vital' })
      strategy.stopDurationVital(typeof nameOrRef === 'string' ? sanitize(nameOrRef)! : nameOrRef, {
        context: sanitize(options && options.context) as Context,
        description: sanitize(options && options.description) as string | undefined,
      })
    }),
  })

  return rumPublicApi
}

function createPostStartStrategy(preStartStrategy: Strategy, startRumResult: StartRumResult): Strategy {
  return {
    init: (initConfiguration: RumInitConfiguration) => {
      displayAlreadyInitializedError('DD_RUM', initConfiguration)
    },
    initConfiguration: preStartStrategy.initConfiguration,
    ...startRumResult,
  }
}
