// PoC rewrite (phase 2 of the internal API plan, see /plan.md): the public API wires directly to
// the RUM internal API, and preStartRum is gone. The internal API buffering replaces the
// pre-start buffer: public API calls land immediately, and events are assembled and sent once the
// session manager resolves. Corner-cuts, documented in /plan.md: tracking consent is assumed
// granted, global / user / account contexts are not supported (no-op), automatic
// instrumentation, telemetry and remote configuration are not started, and plugins 'onRumStart'
// and the recorder / profiler integrations are not wired. Views are tracked by the phase 3a
// trackViews port (trackViewsOnInternalApi.ts): real metrics, location-change / BFCache / session
// renewal.

import { clocksNow, elapsed, toServerDuration, timeStampToClocks } from '@datadog/js-core/time'
import type { ClocksState, Duration, TimeStamp } from '@datadog/js-core/time'
import { deepClone } from '@datadog/js-core/util'
import type {
  Context,
  DeflateWorker,
  DeflateEncoderStreamId,
  PublicApi,
  TrackingConsent,
  User,
  Account,
  RumInternalContext,
  SessionManager,
  Encoder,
  DeflateEncoder,
  Telemetry,
} from '@datadog/browser-core'
import {
  addTelemetryUsage,
  canUseEventBridge,
  callMonitored,
  computeRawError,
  createHandlingStack,
  createIdentityEncoder,
  createTrackingConsentState,
  display,
  displayAlreadyInitializedError,
  ErrorHandling,
  ErrorSource,
  ResourceType,
  initFeatureFlags,
  isAllowedTrackingOrigins,
  makePublicApi,
  mockable,
  monitor,
  monitorError,
  NonErrorPrefix,
  noop,
  sanitize,
  setAllowUntrustedEvents,
  startSessionManager,
  startSessionManagerStub,
  willSyntheticsInjectRum,
} from '@datadog/browser-core'
import { DEFAULT_TRACKED_RESOURCE_HEADERS, validateAndBuildRumConfiguration } from '../domain/configuration'
import type { RumConfiguration, RumInitConfiguration } from '../domain/configuration'
import { createRumInternalApi } from '../domain/internalApi/rumInternalApi'
import type {
  AddEventOptions,
  BeforeSend,
  NonViewEventHandle,
  RumInternalApi,
} from '../domain/internalApi/rumInternalApi'
import { callPluginsMethod } from '../domain/plugins'
import { ActionType, VitalType } from '../rawRumEvent.types'
import type { ViewOptions } from '../domain/view/trackViewsOnInternalApi'
import { trackViewsOnInternalApi } from '../domain/view/trackViewsOnInternalApi'
import { trackClickActionsOnInternalApi } from '../domain/action/trackClickActionsOnInternalApi'
import { createDOMMutationObservable } from '../browser/domMutationObservable'
import { createLocationChangeObservable } from '../browser/locationChangeObservable'
import { createWindowOpenObservable } from '../browser/windowOpenObservable'
import type { ActionOptions } from '../domain/action/trackManualActions'
import type { ResourceOptions, ResourceStopOptions } from '../domain/resource/trackManualResources'
import type {
  AddDurationVitalOptions,
  DurationVitalOptions,
  FeatureOperationOptions,
  OperationOptions,
  FailureReason,
} from '../domain/vital/vitalCollection'
import { startInternalApiBatch } from '../transport/startInternalApiBatch'
import type { LifeCycle } from '../domain/lifeCycle'
import type { ViewHistory } from '../domain/contexts/viewHistory'
import type { ReplayStats } from '../rawRumEvent.types'
import type { Hooks } from '../domain/hooks'
import type { SdkName } from '../domain/contexts/defaultContext'

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
   * Start tracking a custom action.
   *
   * Call {@link stopAction} with the same name (and optional `actionKey`) to send a RUM action event
   * with the elapsed duration. Errors and resources triggered between start and stop are associated
   * with the action.
   *
   * @category Data Collection
   * @param name - Name of the action
   * @param options - Options of the action (@default type: 'custom')
   * @example
   * ```ts
   * datadogRum.startAction('checkout', { context: { cartId: 'abc' } })
   * // ... user completes checkout
   * datadogRum.stopAction('checkout')
   * ```
   */
  startAction: (name: string, options?: ActionOptions) => void

  /**
   * Stop tracking a custom action started with {@link startAction}.
   *
   * Sends a RUM action event with the elapsed duration since the matching start call. Context from
   * start and stop calls is merged into the event.
   *
   * @category Data Collection
   * @param name - Name of the action
   * @param options - Options of the action
   */
  stopAction: (name: string, options?: ActionOptions) => void

  /**
   * Start tracking a resource manually.
   *
   * Use this for network activity that the SDK cannot automatically instrument. Call {@link stopResource}
   * with the same URL (and optional `resourceKey`) to send a RUM resource event with the elapsed duration.
   *
   * @category Data Collection
   * @param url - URL of the resource
   * @param options - Options of the resource (@default type: 'other')
   * @example
   * ```ts
   * datadogRum.startResource('https://api.example.com/users', { type: 'fetch', method: 'POST' })
   * // ... perform the request
   * datadogRum.stopResource('https://api.example.com/users', { statusCode: 201 })
   * ```
   */
  startResource: (url: string, options?: ResourceOptions) => void

  /**
   * Stop tracking a resource started with {@link startResource}.
   *
   * Sends a RUM resource event with the elapsed duration since the matching start call. Context from
   * start and stop calls is merged into the event.
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
   * [Experimental] Manually set the current view's loading time.
   *
   * Call this method when the view has finished loading. The loading time is computed as the
   * elapsed time since the view started. Each call replaces any previously set value (last-call-wins).
   *
   * @category Data Collection
   */
  setViewLoadingTime: () => void

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
   * @param nameOrOptions - The view name, or a {@link ViewOptions} object to configure the view
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
   * If you plan to have multiple durations for the same vital, use the `vitalKey` option to
   * differentiate them. Provide the same key when calling `stopDurationVital`.
   *
   * @category Vital - Duration
   * @param name - Name of the custom vital
   * @param options - Options for the custom vital (vitalKey, context, description)
   * @example
   * ```ts
   * // Simple usage
   * datadogRum.startDurationVital('my-vital')
   * datadogRum.stopDurationVital('my-vital')
   *
   * // Multiple simultaneous vitals with the same name
   * const key = crypto.randomUUID()
   * datadogRum.startDurationVital('my-vital', { vitalKey: key })
   * datadogRum.stopDurationVital('my-vital', { vitalKey: key })
   * ```
   */
  startDurationVital: (name: string, options?: DurationVitalOptions) => void

  /**
   * Stop a custom duration vital
   *
   * @category Vital - Duration
   * @param name - Name of the custom vital
   * @param options - Options for the custom vital (vitalKey, context, description)
   */
  stopDurationVital: (name: string, options?: DurationVitalOptions) => void

  /**
   * Start an operation.
   *
   * Call {@link succeedOperation} or {@link failOperation} with the same name (and optional
   * `operationKey`) to send a RUM vital event marking the end of the operation.
   *
   * @category Vital - Operation
   * @param name - Name of the operation
   * @param options - Options for the operation (operationKey, context, description)
   * @example
   * ```ts
   * datadogRum.startOperation('checkout')
   * // ... perform the operation
   * datadogRum.succeedOperation('checkout')
   * ```
   */
  startOperation: (name: string, options?: OperationOptions) => void

  /**
   * Mark an operation as successful.
   *
   * Sends a RUM vital event marking the end of the operation started with {@link startOperation}.
   *
   * @category Vital - Operation
   * @param name - Name of the operation
   * @param options - Options for the operation (operationKey, context, description)
   */
  succeedOperation: (name: string, options?: OperationOptions) => void

  /**
   * Mark an operation as failed.
   *
   * Sends a RUM vital event marking the end of the operation started with {@link startOperation}.
   *
   * @category Vital - Operation
   * @param name - Name of the operation
   * @param failureReason - Reason for the failure
   * @param options - Options for the operation (operationKey, context, description)
   */
  failOperation: (name: string, failureReason: FailureReason, options?: OperationOptions) => void

  /**
   * Start a feature operation.
   *
   * @category Vital - Feature Operation
   * @deprecated Use {@link startOperation} instead.
   * @param name - Name of the operation
   * @param options - Options for the operation (operationKey, context, description)
   */
  startFeatureOperation: (name: string, options?: FeatureOperationOptions) => void

  /**
   * Mark a feature operation as successful.
   *
   * @category Vital - Feature Operation
   * @deprecated Use {@link succeedOperation} instead.
   * @param name - Name of the operation
   * @param options - Options for the operation (operationKey, context, description)
   */
  succeedFeatureOperation: (name: string, options?: FeatureOperationOptions) => void

  /**
   * Mark a feature operation as failed.
   *
   * @category Vital - Feature Operation
   * @deprecated Use {@link failOperation} instead.
   * @param name - Name of the operation
   * @param failureReason - Reason for the failure
   * @param options - Options for the operation (operationKey, context, description)
   */
  failFeatureOperation: (name: string, failureReason: FailureReason, options?: FeatureOperationOptions) => void

  /**
   * List of default headers used by the {@link RumInitConfiguration.trackResourceHeaders | trackResourceHeaders} option.
   *
   * @deprecated You can now omit `name` from a MatchHeader entry to include default headers.
   */
  DEFAULT_TRACKED_RESOURCE_HEADERS: typeof DEFAULT_TRACKED_RESOURCE_HEADERS
}

export interface RecorderApi {
  start: (options?: StartRecordingOptions) => void
  stop: () => void
  onRumStart: (
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: SessionManager,
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
    sessionManager: SessionManager,
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
  createDeflateEncoder?: (worker: DeflateWorker, streamId: DeflateEncoderStreamId) => DeflateEncoder
  sdkName?: SdkName
}

// PoC phase 2: the public API wires directly to the internal API. The corner-cuts are documented
// at the top of this file and in /plan.md.
export function makeRumPublicApi(
  recorderApi: RecorderApi,
  // PoC corner-cut: the profiler is not wired to the internal API (onRumStart is not called)
  _profilerApi: ProfilerApi,
  options: RumPublicApiOptions = {}
): RumPublicApi {
  const trackingConsentState = createTrackingConsentState()

  let initConfiguration: RumInitConfiguration | undefined
  let configuration: RumConfiguration | undefined
  let internalApi: RumInternalApi | undefined
  let sessionManager: SessionManager | undefined
  // PoC phase 3a: trackViews ported to the internal API (real view metrics, location-change and
  // BFCache renewal, session renewal / expiry). See trackViewsOnInternalApi.ts.
  let viewTracking: ReturnType<typeof trackViewsOnInternalApi> | undefined
  const startedActions = new Map<string, NonViewEventHandle<'action'>>()
  const startedResources = new Map<string, { handle: NonViewEventHandle<'resource'>; method?: string }>()
  const startedDurationVitals = new Map<string, { handle: NonViewEventHandle<'vital'>; startClocks: ClocksState }>()

  const startView: {
    (name?: string): void
    (options: ViewOptions): void
  } = (viewOptions?: string | ViewOptions) => {
    const handlingStack = createHandlingStack('view')
    callMonitored(() => {
      const sanitizedOptions = typeof viewOptions === 'object' ? viewOptions : { name: viewOptions }
      viewTracking?.startView(
        {
          name: sanitizeStringOption(sanitizedOptions.name, 'view name'),
          service: sanitizeStringOption(sanitizedOptions.service, 'view service'),
          version: sanitizeStringOption(sanitizedOptions.version, 'view version'),
          handlingStack,
        },
        clocksNow()
      )
      addTelemetryUsage({ feature: 'start-view' })
    })
  }

  const startOperation: RumPublicApi['startOperation'] = (name, operationOptions) => {
    const handlingStack = createHandlingStack('vital')
    callMonitored(() => {
      addTelemetryUsage({ feature: 'add-operation-step-vital', action_type: 'start' })
      // PoC corner-cut: operations are wired as duration vitals (no step sub-parts)
      doStartDurationVital(name, operationOptions, handlingStack)
    })
  }

  const succeedOperation: RumPublicApi['succeedOperation'] = monitor((name, operationOptions) => {
    addTelemetryUsage({ feature: 'add-operation-step-vital', action_type: 'succeed' })
    doStopDurationVital(name, operationOptions)
  })

  const failOperation: RumPublicApi['failOperation'] = monitor((name, _failureReason, operationOptions) => {
    addTelemetryUsage({ feature: 'add-operation-step-vital', action_type: 'fail' })
    // PoC corner-cut: the failure reason is not part of the vital event
    doStopDurationVital(name, operationOptions)
  })

  const rumPublicApi: RumPublicApi = makePublicApi<RumPublicApi>({
    init: (initConfiguration) => {
      const errorStack = new Error().stack
      callMonitored(() => doInit(initConfiguration, errorStack))
    },

    setTrackingConsent: monitor((trackingConsent) => {
      trackingConsentState.update(trackingConsent)
      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: trackingConsent })
    }),

    setViewName: monitor((name: string) => {
      if (!assertStarted('setViewName') || !viewTracking) {
        return
      }
      viewTracking.setViewName(sanitizeStringOption(name, 'view name')!)
      addTelemetryUsage({ feature: 'set-view-name' })
    }),

    // The view context lives with trackViews (per-view state, throttled updates on change)
    setViewContext: monitor((context: Context) => {
      viewTracking?.setViewContext(context)
    }),
    setViewContextProperty: monitor((key: string, value: any) => {
      viewTracking?.setViewContextProperty(key, value)
    }),
    getViewContext: monitor(() => viewTracking?.getViewContext() ?? {}),

    getInternalContext: monitor(() => undefined as RumInternalContext | undefined),

    getInitConfiguration: monitor(() => deepClone(initConfiguration)),

    addAction: (name, context) => {
      const handlingStack = createHandlingStack('action')
      callMonitored(() => {
        if (!assertStarted('addAction')) {
          return
        }
        internalApi!.addEvent({
          baseRumEvent: {
            type: 'action',
            action: { type: ActionType.CUSTOM, target: { name: sanitize(name)! } },
            context: sanitize(context) as Context,
          },
          baggage: { domainContext: { handlingStack } },
        })
        addTelemetryUsage({ feature: 'add-action' })
      })
    },

    startAction: monitor((name, actionOptions) => {
      addTelemetryUsage({ feature: 'start-action' })
      if (!assertStarted('startAction')) {
        return
      }
      const handlingStack = createHandlingStack('action')
      startedActions.set(
        actionKey(sanitize(name)!, actionOptions?.actionKey),
        internalApi!.startEvent(
          {
            type: 'action',
            action: { type: actionOptions?.type ?? ActionType.CUSTOM, target: { name: sanitize(name)! } },
            context: sanitize(actionOptions?.context) as Context,
          },
          { domainContext: { handlingStack } }
        )
      )
    }),

    stopAction: monitor((name, actionOptions) => {
      addTelemetryUsage({ feature: 'stop-action' })
      const handle = startedActions.get(actionKey(sanitize(name)!, actionOptions?.actionKey))
      if (!handle) {
        return
      }
      startedActions.delete(actionKey(sanitize(name)!, actionOptions?.actionKey))
      handle.stop({
        action: { target: { name: sanitize(name)! } },
        context: sanitize(actionOptions?.context) as Context,
      })
    }),

    startResource: monitor((url, resourceOptions) => {
      addTelemetryUsage({ feature: 'start-resource' })
      if (!assertStarted('startResource')) {
        return
      }
      startedResources.set(resourceKey(sanitize(url)!, resourceOptions?.resourceKey), {
        handle: internalApi!.startEvent({
          type: 'resource',
          resource: { url: sanitize(url)! },
          context: sanitize(resourceOptions?.context) as Context,
        }),
        method: sanitize(resourceOptions?.method) as string | undefined,
      })
    }),

    stopResource: monitor((url, resourceOptions) => {
      addTelemetryUsage({ feature: 'stop-resource' })
      const key = resourceKey(sanitize(url)!, resourceOptions?.resourceKey)
      const resource = startedResources.get(key)
      if (!resource) {
        return
      }
      startedResources.delete(key)
      // PoC corner-cut: the resource type defaults to the start one or 'other'; tracing headers,
      // graphql and size computations are not wired.
      resource.handle.stop({
        resource: {
          url: sanitize(url)!,
          type: resourceOptions?.type ?? ResourceType.OTHER,
          method: resource.method,
          status_code: resourceOptions?.statusCode,
        },
        context: sanitize(resourceOptions?.context) as Context,
      })
    }),

    addError: (error, context) => {
      const handlingStack = createHandlingStack('error')
      callMonitored(() => {
        if (!assertStarted('addError')) {
          return
        }
        const startClocks = clocksNow()
        const rawError = computeRawError({
          originalError: error,
          handlingStack,
          componentStack: undefined,
          startClocks,
          nonErrorPrefix: NonErrorPrefix.PROVIDED,
          source: ErrorSource.CUSTOM,
          handling: ErrorHandling.HANDLED,
        })
        internalApi!.addEvent({
          // Cast: some raw error fields (causes, debug ids) don't fit the kickoff Context shape
          baseRumEvent: {
            type: 'error',
            error: {
              message: rawError.message,
              source: rawError.source,
              stack: rawError.stack,
              handling_stack: rawError.handlingStack,
              type: rawError.type,
              handling: rawError.handling,
              causes: rawError.causes,
              fingerprint: rawError.fingerprint,
              csp: rawError.csp,
            },
            context: sanitize(context) as Context,
            _dd: { debug_ids: rawError.debugIds },
          } as unknown as AddEventOptions['baseRumEvent'],
          baggage: {
            startClocks,
            domainContext: { error, handlingStack },
            originalError: error,
          },
        })
        addTelemetryUsage({ feature: 'add-error' })
      })
    },

    addTiming: monitor((name, time) => {
      if (!assertStarted('addTiming') || !viewTracking) {
        return
      }
      // TODO: next major decide to drop relative time support or update its behaviour
      viewTracking.addTiming(sanitize(name)!, time as TimeStamp)
    }),

    setViewLoadingTime: monitor(() => {
      if (!assertStarted('setViewLoadingTime') || !viewTracking) {
        return
      }
      viewTracking.setLoadingTime()
      addTelemetryUsage({
        feature: 'addViewLoadingTime',
      })
    }),

    // PoC corner-cut: context managers are not supported (the internal API does not assemble
    // contexts yet); the methods stay in the public surface as no-ops.
    setGlobalContext: monitor(noop),
    getGlobalContext: monitor(() => ({})),
    setGlobalContextProperty: monitor(noop),
    removeGlobalContextProperty: monitor(noop),
    clearGlobalContext: monitor(noop),

    setUser: monitor(noop),
    getUser: monitor(() => ({})),
    setUserProperty: monitor(noop),
    removeUserProperty: monitor(noop),
    clearUser: monitor(noop),

    setAccount: monitor(noop),
    getAccount: monitor(() => ({})),
    setAccountProperty: monitor(noop),
    removeAccountProperty: monitor(noop),
    clearAccount: monitor(noop),

    startView,

    stopSession: monitor(() => {
      sessionManager?.expire()
      addTelemetryUsage({ feature: 'stop-session' })
    }),

    // PoC corner-cut: feature flags are assembled by a context hook, not wired yet
    addFeatureFlagEvaluation: monitor(() => {
      addTelemetryUsage({ feature: 'add-feature-flag-evaluation' })
    }),

    // PoC corner-cut: the recorder is not wired to the internal API (onRumStart is not called)
    getSessionReplayLink: monitor(() => recorderApi.getSessionReplayLink()),
    startSessionReplayRecording: monitor(noop),
    stopSessionReplayRecording: monitor(noop),

    addDurationVital: (name, options) => {
      const handlingStack = createHandlingStack('vital')
      callMonitored(() => {
        if (!assertStarted('addDurationVital')) {
          return
        }
        addTelemetryUsage({ feature: 'add-duration-vital' })
        const startClocks = timeStampToClocks(options.startTime as TimeStamp)
        internalApi!.addEvent({
          baseRumEvent: {
            type: 'vital',
            vital: {
              name: sanitize(name)!,
              type: VitalType.DURATION,
              duration: toServerDuration(options.duration as Duration),
            },
            context: sanitize(options?.context) as Context,
            description: sanitize(options?.description) as string | undefined,
          },
          baggage: {
            startClocks,
            duration: options.duration as Duration,
            domainContext: { handlingStack },
          },
        })
      })
    },

    startDurationVital: (name, vitalOptions) => {
      const handlingStack = createHandlingStack('vital')
      callMonitored(() => {
        addTelemetryUsage({ feature: 'start-duration-vital' })
        doStartDurationVital(name, vitalOptions, handlingStack)
      })
    },

    stopDurationVital: monitor((name, vitalOptions) => {
      addTelemetryUsage({ feature: 'stop-duration-vital' })
      doStopDurationVital(name, vitalOptions)
    }),

    startOperation,
    succeedOperation,
    failOperation,

    // Deprecated aliases — kept for backwards compatibility, forward to the renamed APIs above.
    // TODO: remove in the next major version (RUM-16921).
    startFeatureOperation: startOperation,
    succeedFeatureOperation: succeedOperation,
    failFeatureOperation: failOperation,

    DEFAULT_TRACKED_RESOURCE_HEADERS,
  })

  return rumPublicApi

  //
  // Init
  //

  function doInit(newInitConfiguration: RumInitConfiguration, errorStack?: string) {
    if (!newInitConfiguration) {
      display.error('Missing configuration')
      return
    }
    // Set the experimental feature flags as early as possible, so we can use them in most places
    initFeatureFlags(newInitConfiguration.enableExperimentalFeatures)
    setAllowUntrustedEvents(newInitConfiguration.allowUntrustedEvents)

    // If we are in a Synthetics test configured to automatically inject a RUM instance, we want
    // to completely discard the customer application RUM instance by ignoring their init() call.
    if (options.ignoreInitIfSyntheticsWillInjectRum && willSyntheticsInjectRum()) {
      return
    }

    callPluginsMethod(newInitConfiguration.plugins, 'onInit', {
      initConfiguration: newInitConfiguration,
      publicApi: rumPublicApi,
    })

    if (configuration) {
      displayAlreadyInitializedError('DD_RUM', newInitConfiguration)
      return
    }

    const newConfiguration = validateAndBuildRumConfiguration(newInitConfiguration)
    if (!newConfiguration || !isAllowedTrackingOrigins(newConfiguration, errorStack ?? '')) {
      return
    }
    // Set the local variables only after the configuration is valid
    configuration = newConfiguration
    initConfiguration = newInitConfiguration

    trackingConsentState.tryToInit(configuration.trackingConsent)
    // PoC corner-cut: tracking consent is assumed granted (see /plan.md): the session manager is
    // started right away, no pre-start deferral.
    trackingConsentState.update('granted')

    const sessionManagerPromise = canUseEventBridge()
      ? startSessionManagerStub()
      : mockable(startSessionManager)(configuration, trackingConsentState)
    void sessionManagerPromise
      .then((newSessionManager) => {
        sessionManager = newSessionManager
      })
      .catch(monitorError)

    internalApi = createRumInternalApi({
      sessionManager: sessionManagerPromise,
      beforeSend: configuration.beforeSend as unknown as BeforeSend,
    })

    let deflateWorker: DeflateWorker | undefined
    if (configuration.compressIntakeRequests && !canUseEventBridge() && options.startDeflateWorker) {
      deflateWorker = options.startDeflateWorker(configuration, 'Datadog RUM', noop)
      if (!deflateWorker) {
        // `startDeflateWorker` should have logged an error message explaining the issue
        return
      }
    }
    const createEncoder =
      deflateWorker && options.createDeflateEncoder
        ? (streamId: DeflateEncoderStreamId) => options.createDeflateEncoder!(deflateWorker, streamId)
        : createIdentityEncoder

    const { prepareUrgentFlushObservable } = startInternalApiBatch(
      configuration,
      internalApi,
      sessionManagerPromise,
      createEncoder
    )

    const domMutationObservable = createDOMMutationObservable()
    const { observable: windowOpenObservable } = createWindowOpenObservable()

    viewTracking = trackViewsOnInternalApi(
      internalApi,
      prepareUrgentFlushObservable,
      domMutationObservable,
      windowOpenObservable,
      configuration,
      createLocationChangeObservable(),
      !configuration.trackViewsManually
    )

    // PoC phase 3b: click actions tracked through the internal API (startEvent / stop with the
    // click context at activity end, cancel on discard; frustration computation unchanged). See
    // trackClickActionsOnInternalApi.ts.
    if (configuration.trackUserInteractions) {
      trackClickActionsOnInternalApi(
        internalApi,
        prepareUrgentFlushObservable,
        domMutationObservable,
        windowOpenObservable,
        configuration
      )
    }
  }

  function assertStarted(method: string): boolean {
    if (!internalApi) {
      display.error(`DD_RUM.${method}() called before DD_RUM.init().`)
      return false
    }
    return true
  }

  //
  // Duration vitals (and operations, wired as duration vitals)
  //

  function doStartDurationVital(
    name: string,
    options: { vitalKey?: string; operationKey?: string; context?: Context; description?: string } | undefined,
    handlingStack: string
  ) {
    if (!assertStarted('startDurationVital')) {
      return
    }
    const startClocks = clocksNow()
    const handle = internalApi!.startEvent(
      {
        type: 'vital',
        vital: { name: sanitize(name)!, type: VitalType.DURATION },
        context: sanitize(options?.context) as Context,
        description: sanitize(options?.description) as string | undefined,
      },
      { startClocks, domainContext: { handlingStack } }
    )
    startedDurationVitals.set(vitalKey(sanitize(name)!, options?.vitalKey ?? options?.operationKey), {
      handle,
      startClocks,
    })
  }

  function doStopDurationVital(
    name: string,
    options: { vitalKey?: string; operationKey?: string; context?: Context; description?: string } | undefined
  ) {
    const key = vitalKey(sanitize(name)!, options?.vitalKey ?? options?.operationKey)
    const vital = startedDurationVitals.get(key)
    if (!vital) {
      return
    }
    startedDurationVitals.delete(key)
    const endClocks = clocksNow()
    vital.handle.stop(
      {
        vital: { duration: toServerDuration(elapsed(vital.startClocks.timeStamp, endClocks.timeStamp)) },
        context: sanitize(options?.context) as Context,
        description: sanitize(options?.description) as string | undefined,
      },
      { endClocks }
    )
  }
}

function sanitizeStringOption(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    display.warn(`Invalid ${label} provided (expected a string, got ${typeof value}). Ignoring.`)
    return undefined
  }
  return sanitize(value)
}

function actionKey(name: string, actionKey: string | undefined) {
  return `${name}::${actionKey ?? ''}`
}

function resourceKey(url: string, resourceKey: string | undefined) {
  return `${url}::${resourceKey ?? ''}`
}

function vitalKey(name: string, key: string | undefined) {
  return `${name}::${key ?? ''}`
}
