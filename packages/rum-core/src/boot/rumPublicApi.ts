import type {
  Context,
  TimeStamp,
  RelativeTime,
  DeflateWorker,
  DeflateEncoderStreamId,
  DeflateEncoder,
  PublicApi,
  Duration,
  ContextManager,
  TrackingConsent,
  User,
  Account,
  RumInternalContext,
  Telemetry,
  Encoder,
  ResourceType,
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
  startBufferingData,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
  mockable,
} from '@datadog/browser-core'

import type { LifeCycle } from '../domain/lifeCycle'
import type { ViewHistory } from '../domain/contexts/viewHistory'
import type { RumSessionManager } from '../domain/rumSessionManager'
import type { ReplayStats } from '../rawRumEvent.types'
import { ActionType, VitalType } from '../rawRumEvent.types'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import type { ViewOptions } from '../domain/view/trackViews'
import type {
  AddDurationVitalOptions,
  DurationVitalReference,
  DurationVitalOptions,
  FeatureOperationOptions,
  FailureReason,
} from '../domain/vital/vitalCollection'
import { createCustomVitalsState } from '../domain/vital/vitalCollection'
import { callPluginsMethod } from '../domain/plugins'
import type { Hooks } from '../domain/hooks'
import type { SdkName } from '../domain/contexts/defaultContext'
import type { ActionOptions } from '../domain/action/trackManualActions'
import type { ResourceOptions, ResourceStopOptions } from '../domain/resource/trackManualResources'
import { createPreStartStrategy } from './preStartRum'
import type { StartRumResult } from './startRum'
import { startRum } from './startRum'

export interface StartRecordingOptions {
  force: boolean
}

/**
 * Public API for the RUM browser SDK.
 *
 * See [RUM Browser Monitoring Setup](https://docs.datadoghq.com/real_user_monitoring/browser) for further information.
 *
 * @category Main
 */
export interface RumPublicApi extends PublicApi {
  /**
   * Init the RUM browser SDK.
   *
   * See [RUM Browser Monitoring Setup](https://docs.datadoghq.com/real_user_monitoring/browser) for further information.
   *
   * @category Init
   * @param initConfiguration - Configuration options of the SDK
   * @example
   * ```ts
   * datadogRum.init({
   *   applicationId: '<DATADOG_APPLICATION_ID>',
   *   clientToken: '<DATADOG_CLIENT_TOKEN>',
   *   site: '<DATADOG_SITE>',
   *   // ...
   * })
   * ```
   */
  init: (initConfiguration: RumInitConfiguration) => void

  /**
   * Set the tracking consent of the current user.
   *
   * Data will be sent only if it is set to "granted". This value won't be stored by the library
   * across page loads: you will need to call this method or set the appropriate `trackingConsent`
   * field in the init() method at each page load.
   *
   * If this method is called before the init() method, the provided value will take precedence
   * over the one provided as initialization parameter.
   *
   * See [User tracking consent](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-tracking-consent) for further information.
   *
   * @category Privacy
   * @param trackingConsent - The user tracking consent
   */
  setTrackingConsent: (trackingConsent: TrackingConsent) => void

  /**
   * Set View Name.
   *
   * Enable to manually change the name of the current view.
   * See [Override default RUM view names](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#override-default-rum-view-names) for further information.
   *
   * @category Context - View
   * @param name - Name of the view
   */
  setViewName: (name: string) => void

  /**
   * Set View Context.
   *
   * Enable to manually set the context of the current view.
   *
   * @category Context - View
   * @param context - Context of the view
   */
  setViewContext: (context: Context) => void
  /**
   * Set View Context Property.
   *
   * Enable to manually set a property of the context of the current view.
   *
   * @category Context - View
   * @param key - key of the property
   * @param value - value of the property
   */
  setViewContextProperty: (key: string, value: any) => void

  /**
   * Get View Context.
   *
   * @category Context - View
   */
  getViewContext(): Context

  /**
   * [Internal API] Get the internal SDK context
   *
   * @internal
   */
  getInternalContext: (startTime?: number) => RumInternalContext | undefined

  /**
   * Get the init configuration
   *
   * @category Init
   * @returns RumInitConfiguration | undefined
   */
  getInitConfiguration: () => RumInitConfiguration | undefined

  /**
   * Add a custom action, stored in `@action`
   *
   * See [Send RUM Custom Actions](https://docs.datadoghq.com/real_user_monitoring/guide/send-rum-custom-actions) for further information.
   *
   * @category Data Collection
   * @param name - Name of the action
   * @param context - Context of the action
   */
  addAction: (name: string, context?: object) => void

  /**
   * [Experimental] Start an action, stored in `@action`
   *
   * @category Data Collection
   * @param name - Name of the action
   * @param options - Options of the action (@default type: 'custom')
   */
  startAction: (name: string, options?: ActionOptions) => void

  /**
   * [Experimental] Stop an action, stored in `@action`
   *
   * @category Data Collection
   * @param name - Name of the action
   * @param options - Options of the action
   */
  stopAction: (name: string, options?: ActionOptions) => void

  /**
   * [Experimental] Start tracking a resource, stored in `@resource`
   *
   * @category Data Collection
   * @param url - URL of the resource
   * @param options - Options of the resource (@default type: 'other')
   */
  startResource: (url: string, options?: ResourceOptions) => void

  /**
   * [Experimental] Stop tracking a resource, stored in `@resource`
   *
   * @category Data Collection
   * @param url - URL of the resource
   * @param options - Options of the resource
   */
  stopResource: (url: string, options?: ResourceStopOptions) => void

  /**
   * Add a custom error, stored in `@error`.
   *
   * See [Send RUM Custom Actions](https://docs.datadoghq.com/real_user_monitoring/guide/send-rum-custom-actions) for further information.
   *
   * @category Data Collection
   * @param error - Error. Favor sending a [Javascript Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) to have a stack trace attached to the error event.
   * @param context - Context of the error
   */
  addError: (error: unknown, context?: object) => void

  /**
   * Add a custom timing relative to the start of the current view,
   * stored in `@view.custom_timings.<timing_name>`
   *
   * Note: passing a relative time is discouraged since it is actually used as-is but displayed relative to the view start.
   * We currently don't provide a way to retrieve the view start time, so it can be challenging to provide a timing relative to the view start.
   * see https://github.com/DataDog/browser-sdk/issues/2552
   *
   * @category Data Collection
   * @param name - Name of the custom timing
   * @param [time] - Epoch timestamp of the custom timing (if not set, will use current time)
   */
  addTiming: (name: string, time?: number) => void

  /**
   * Set the global context information to all events, stored in `@context`
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   *
   * @category Context - Global Context
   * @param context - Global context
   */
  setGlobalContext: (context: Context) => void

  /**
   * Get the global Context
   *
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   *
   * @category Context - Global Context
   */
  getGlobalContext: () => Context

  /**
   * Set or update a global context property, stored in `@context.<key>`
   *
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   *
   * @category Context - Global Context
   * @param key - Key of the property
   * @param value - Value of the property
   */
  setGlobalContextProperty: (key: any, value: any) => void

  /**
   * Remove a global context property
   *
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   *
   * @category Context - Global Context
   */
  removeGlobalContextProperty: (key: any) => void

  /**
   * Clear the global context
   *
   * See [Global context](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#global-context) for further information.
   *
   * @category Context - Global Context
   */
  clearGlobalContext(): void

  /**
   * Set user information to all events, stored in `@usr`
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   *
   * @category Context - User
   * @param newUser - User information
   */
  setUser(newUser: User & { id: string }): void

  /**
   * Set user information to all events, stored in `@usr`
   *
   * @category Context - User
   * @deprecated You must specify a user id, favor using {@link setUser} instead
   * @param newUser - User information with optional id
   */
  setUser(newUser: User): void

  /**
   * Get user information
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   *
   * @category Context - User
   * @returns User information
   */
  getUser: () => Context

  /**
   * Set or update the user property, stored in `@usr.<key>`
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   *
   * @category Context - User
   * @param key - Key of the property
   * @param property - Value of the property
   */
  setUserProperty: (key: any, property: any) => void

  /**
   * Remove a user property
   *
   * @category Context - User
   * @param key - Key of the property to remove
   * @see [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   */
  removeUserProperty: (key: any) => void

  /**
   * Clear all user information
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   *
   * @category Context - User
   */
  clearUser: () => void

  /**
   * Set account information to all events, stored in `@account`
   *
   * @category Context - Account
   * @param newAccount - Account information
   */
  setAccount: (newAccount: Account) => void

  /**
   * Get account information
   *
   * @category Context - Account
   * @returns Account information
   */
  getAccount: () => Context

  /**
   * Set or update the account property, stored in `@account.<key>`
   *
   * @category Context - Account
   * @param key - Key of the property
   * @param property - Value of the property
   */
  setAccountProperty: (key: string, property: any) => void

  /**
   * Remove an account property
   *
   * @category Context - Account
   * @param key - Key of the property to remove
   */
  removeAccountProperty: (key: string) => void

  /**
   * Clear all account information
   *
   * @category Context - Account
   * @returns Clear all account information
   */
  clearAccount: () => void
  /**
   * Start a view manually.
   * Enable to manual start a view, use `trackViewsManually: true` init parameter and call `startView()` to create RUM views and be aligned with how you’ve defined them in your SPA application routing.
   *
   * See [Override default RUM view names](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#override-default-rum-view-names) for further information.
   *
   * Context - @category Data Collection
   *
   * @param nameOrOptions - Name or options (name, service, version) for the view
   */
  startView(nameOrOptions?: string | ViewOptions): void

  /**
   * Stop the session. A new session will start at the next user interaction with the page.
   *
   * @category Session
   */
  stopSession(): void

  /**
   * Add a feature flag evaluation,
   * stored in `@feature_flags.<feature_flag_key>`
   *
   * We recommend enabling the intake request compression when using feature flags `compressIntakeRequests: true`.
   *
   * See [Feature Flag Tracking](https://docs.datadoghq.com/real_user_monitoring/feature_flag_tracking/) for further information.
   *
   * @category Data Collection
   * @param key - The key of the feature flag.
   * @param value - The value of the feature flag.
   */
  addFeatureFlagEvaluation: (key: string, value: any) => void

  /**
   * Get the Session Replay Link.
   *
   * See [Connect Session Replay To Your Third-Party Tools](https://docs.datadoghq.com/real_user_monitoring/guide/connect-session-replay-to-your-third-party-tools) for further information.
   *
   * @category Session Replay
   */
  getSessionReplayLink: () => string | undefined

  /**
   * Start Session Replay recording.
   * Enable to conditionally start the recording, use the `startSessionReplayRecordingManually:true` init parameter and call `startSessionReplayRecording()`
   *
   * See [Browser Session Replay](https://docs.datadoghq.com/real_user_monitoring/session_replay/browser) for further information.
   *
   * @category Session Replay
   */
  startSessionReplayRecording: (options?: StartRecordingOptions) => void

  /**
   * Stop Session Replay recording.
   *
   * See [Browser Session Replay](https://docs.datadoghq.com/real_user_monitoring/session_replay/browser) for further information.
   *
   * @category Session Replay
   */
  stopSessionReplayRecording: () => void

  /**
   * Add a custom duration vital
   *
   * @category Vital - Duration
   * @param name - Name of the custom vital
   * @param options - Options for the custom vital (startTime, duration, context, description)
   */
  addDurationVital: (name: string, options: AddDurationVitalOptions) => void

  /**
   * Start a custom duration vital.
   *
   * If you plan to have multiple durations for the same vital, you should use the reference returned by this method.
   *
   * @category Vital - Duration
   * @param name - Name of the custom vital
   * @param options - Options for the custom vital (context, description)
   * @returns reference to the custom vital
   */
  startDurationVital: (name: string, options?: DurationVitalOptions) => DurationVitalReference

  /**
   * Stop a custom duration vital
   *
   * @category Vital - Duration
   * @param nameOrRef - Name or reference of the custom vital
   * @param options - Options for the custom vital (operationKey, context, description)
   */
  stopDurationVital: (nameOrRef: string | DurationVitalReference, options?: DurationVitalOptions) => void

  /**
   * start a feature operation
   *
   * @category Vital - Feature Operation
   * @param name - Name of the operation step
   * @param options - Options for the operation step (operationKey, context, description)
   * @hidden // TODO: replace by @since when GA
   */
  startFeatureOperation: (name: string, options?: FeatureOperationOptions) => void

  /**
   * succeed a feature operation
   *
   * @category Vital - Feature Operation
   * @param name - Name of the operation step
   * @param options - Options for the operation step (operationKey, context, description)
   * @hidden // TODO: replace by @since when GA
   */
  succeedFeatureOperation: (name: string, options?: FeatureOperationOptions) => void

  /**
   * fail a feature operation
   *
   * @category Vital - Feature Operation
   * @param name - Name of the operation step
   * @param failureReason - Reason for the failure
   * @param options - Options for the operation step (operationKey, context, description)
   * @hidden // TODO: replace by @since when GA
   */
  failFeatureOperation: (name: string, failureReason: FailureReason, options?: FeatureOperationOptions) => void
}

export interface RecorderApi {
  start: (options?: StartRecordingOptions) => void
  stop: () => void
  onRumStart: (
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory,
    deflateWorker: DeflateWorker | undefined,
    telemetry: Telemetry
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
    viewHistory: ViewHistory,
    createEncoder: (streamId: DeflateEncoderStreamId) => Encoder
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
  sdkName?: SdkName
}

export interface Strategy {
  init: (initConfiguration: RumInitConfiguration, publicApi: RumPublicApi, errorStack?: string) => void
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
  startAction: StartRumResult['startAction']
  stopAction: StartRumResult['stopAction']
  startResource: StartRumResult['startResource']
  stopResource: StartRumResult['stopResource']
  addError: StartRumResult['addError']
  addFeatureFlagEvaluation: StartRumResult['addFeatureFlagEvaluation']
  startDurationVital: StartRumResult['startDurationVital']
  stopDurationVital: StartRumResult['stopDurationVital']
  addDurationVital: StartRumResult['addDurationVital']
  addOperationStepVital: StartRumResult['addOperationStepVital']
}

export function makeRumPublicApi(
  recorderApi: RecorderApi,
  profilerApi: ProfilerApi,
  options: RumPublicApiOptions = {}
): RumPublicApi {
  const trackingConsentState = createTrackingConsentState()
  const customVitalsState = createCustomVitalsState()
  const bufferedDataObservable = startBufferingData().observable

  let strategy = createPreStartStrategy(
    options,
    trackingConsentState,
    customVitalsState,
    (configuration, deflateWorker, initialViewOptions, telemetry, hooks) => {
      const createEncoder =
        deflateWorker && options.createDeflateEncoder
          ? (streamId: DeflateEncoderStreamId) => options.createDeflateEncoder!(configuration, deflateWorker, streamId)
          : createIdentityEncoder

      const startRumResult = mockable(startRum)(
        configuration,
        recorderApi,
        profilerApi,
        initialViewOptions,
        createEncoder,
        trackingConsentState,
        customVitalsState,
        bufferedDataObservable,
        telemetry,
        hooks,
        options.sdkName
      )

      recorderApi.onRumStart(
        startRumResult.lifeCycle,
        configuration,
        startRumResult.session,
        startRumResult.viewHistory,
        deflateWorker,
        startRumResult.telemetry
      )

      profilerApi.onRumStart(
        startRumResult.lifeCycle,
        startRumResult.hooks,
        configuration,
        startRumResult.session,
        startRumResult.viewHistory,
        createEncoder
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
  } = (options?: string | ViewOptions) => {
    const handlingStack = createHandlingStack('view')
    callMonitored(() => {
      const sanitizedOptions = typeof options === 'object' ? options : { name: options }
      strategy.startView({ ...sanitizedOptions, handlingStack })
      addTelemetryUsage({ feature: 'start-view' })
    })
  }

  const rumPublicApi: RumPublicApi = makePublicApi<RumPublicApi>({
    init: (initConfiguration) => {
      const errorStack = new Error().stack
      callMonitored(() => strategy.init(initConfiguration, rumPublicApi, errorStack))
    },

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

    startAction: monitor((name, options) => {
      // Check feature flag only after init; pre-init calls should be buffered
      if (strategy.initConfiguration && !isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_ACTION)) {
        return
      }
      // addTelemetryUsage({ feature: 'start-action' })
      strategy.startAction(sanitize(name)!, {
        type: sanitize(options && options.type) as ActionType | undefined,
        context: sanitize(options && options.context) as Context,
        actionKey: options && options.actionKey,
      })
    }),

    stopAction: monitor((name, options) => {
      if (strategy.initConfiguration && !isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_ACTION)) {
        return
      }
      // addTelemetryUsage({ feature: 'stop-action' })
      strategy.stopAction(sanitize(name)!, {
        type: sanitize(options && options.type) as ActionType | undefined,
        context: sanitize(options && options.context) as Context,
        actionKey: options && options.actionKey,
      })
    }),

    startResource: monitor((url, options) => {
      // Check feature flag only after init; pre-init calls should be buffered
      if (strategy.initConfiguration && !isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_RESOURCE)) {
        return
      }
      // addTelemetryUsage({ feature: 'start-resource' })
      strategy.startResource(sanitize(url)!, {
        type: sanitize(options && options.type) as ResourceType | undefined,
        method: sanitize(options && options.method) as string | undefined,
        context: sanitize(options && options.context) as Context,
        resourceKey: options && options.resourceKey,
      })
    }),

    stopResource: monitor((url, options) => {
      if (strategy.initConfiguration && !isExperimentalFeatureEnabled(ExperimentalFeature.START_STOP_RESOURCE)) {
        return
      }
      // addTelemetryUsage({ feature: 'stop-resource' })
      strategy.stopResource(sanitize(url)!, {
        statusCode: options && options.statusCode,
        context: sanitize(options && options.context) as Context,
        resourceKey: options && options.resourceKey,
      })
    }),

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

    addDurationVital: (name, options) => {
      const handlingStack = createHandlingStack('vital')
      callMonitored(() => {
        addTelemetryUsage({ feature: 'add-duration-vital' })
        strategy.addDurationVital({
          name: sanitize(name)!,
          type: VitalType.DURATION,
          startClocks: timeStampToClocks(options.startTime as TimeStamp),
          duration: options.duration as Duration,
          context: sanitize(options && options.context) as Context,
          description: sanitize(options && options.description) as string | undefined,
          handlingStack,
        })
      })
    },

    startDurationVital: (name, options) => {
      const handlingStack = createHandlingStack('vital')
      return callMonitored(() => {
        addTelemetryUsage({ feature: 'start-duration-vital' })
        return strategy.startDurationVital(sanitize(name)!, {
          context: sanitize(options && options.context) as Context,
          description: sanitize(options && options.description) as string | undefined,
          handlingStack,
        })
      }) as DurationVitalReference
    },

    stopDurationVital: monitor((nameOrRef, options) => {
      addTelemetryUsage({ feature: 'stop-duration-vital' })
      strategy.stopDurationVital(typeof nameOrRef === 'string' ? sanitize(nameOrRef)! : nameOrRef, {
        context: sanitize(options && options.context) as Context,
        description: sanitize(options && options.description) as string | undefined,
      })
    }),

    startFeatureOperation: monitor((name, options) => {
      addTelemetryUsage({ feature: 'add-operation-step-vital', action_type: 'start' })
      strategy.addOperationStepVital(name, 'start', options)
    }),

    succeedFeatureOperation: monitor((name, options) => {
      addTelemetryUsage({ feature: 'add-operation-step-vital', action_type: 'succeed' })
      strategy.addOperationStepVital(name, 'end', options)
    }),

    failFeatureOperation: monitor((name, failureReason, options) => {
      addTelemetryUsage({ feature: 'add-operation-step-vital', action_type: 'fail' })
      strategy.addOperationStepVital(name, 'end', options, failureReason)
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
