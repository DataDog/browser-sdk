import type { Configuration, InitConfiguration, MatchOption, RawTelemetryConfiguration } from '@datadog/browser-core'
import {
  getType,
  isMatchOption,
  serializeConfiguration,
  DefaultPrivacyLevel,
  TraceContextInjection,
  display,
  objectHasValue,
  validateAndBuildConfiguration,
  isSampleRate,
  isNumber,
  isNonEmptyArray,
} from '@datadog/browser-core'
import type { RumEventDomainContext } from '../../domainContext.types'
import type { RumEvent } from '../../rumEvent.types'
import type { RumPlugin } from '../plugins'
import { isTracingOption } from '../tracing/tracer'
import type { PropagatorType, TracingOption } from '../tracing/tracer.types'

export const DEFAULT_PROPAGATOR_TYPES: PropagatorType[] = ['tracecontext', 'datadog']

/**
 * Init Configuration for the RUM browser SDK.
 *
 * @category Main
 * @example NPM
 * ```ts
 * import { datadogRum } from '@datadog/browser-rum'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   // ...
 * })
 * ```
 * @example CDN
 * ```ts
 * DD_RUM.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   ...
 * })
 * ```
 */
export interface RumInitConfiguration extends InitConfiguration {
  // global options
  /**
   * The RUM application ID.
   *
   * @category Authentication
   */
  applicationId: string

  /**
   * Whether to propagate user and account IDs in the baggage header of trace requests.
   *
   * @category Tracing
   * @defaultValue false
   */
  propagateTraceBaggage?: boolean | undefined

  /**
   * Access to every event collected by the RUM SDK before they are sent to Datadog.
   * It allows:
   * - Enrich your RUM events with additional context attributes
   * - Modify your RUM events to modify their content, or redact sensitive sequences (see the list of editable properties)
   * - Discard selected RUM events
   *
   * See [Enrich And Control Browser RUM Data With beforeSend](https://docs.datadoghq.com/real_user_monitoring/guide/enrich-and-control-rum-data) for further information.
   *
   * @category Data Collection
   * @param event - The RUM event
   * @param context - The RUM event domain context providing access to native browser data based on the event type (e.g. error, performance entry).
   * @returns true if the event should be sent to Datadog, false otherwise
   */
  beforeSend?: ((event: RumEvent, context: RumEventDomainContext) => boolean) | undefined

  /**
   * A list of request origins ignored when computing the page activity.
   * See [How page activity is calculated](https://docs.datadoghq.com/real_user_monitoring/browser/monitoring_page_performance/#how-page-activity-is-calculated) for further information.
   */
  excludedActivityUrls?: MatchOption[] | undefined

  /**
   * URL pointing to the Datadog Browser SDK Worker JavaScript file. The URL can be relative or absolute, but is required to have the same origin as the web application.
   * See [Content Security Policy guidelines](https://docs.datadoghq.com/integrations/content_security_policy_logs/?tab=firefox#use-csp-with-real-user-monitoring-and-session-replay) for further information.
   *
   * @category Transport
   */
  workerUrl?: string

  /**
   * Compress requests sent to the Datadog intake to reduce bandwidth usage when sending large amounts of data. The compression is done in a Worker thread.
   * See [Content Security Policy guidelines](https://docs.datadoghq.com/integrations/content_security_policy_logs/?tab=firefox#use-csp-with-real-user-monitoring-and-session-replay) for further information.
   *
   * @category Transport
   */
  compressIntakeRequests?: boolean | undefined

  /**
   * [Internal option] Id of the remote configuration
   *
   * @internal
   */
  remoteConfigurationId?: string | undefined

  /**
   * [Internal option] set a proxy URL for the remote configuration
   *
   * @internal
   */
  remoteConfigurationProxy?: string | undefined

  // tracing options
  /**
   * A list of request URLs used to inject tracing headers.
   * See [Connect RUM and Traces](https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum) for further information.
   *
   * @category Tracing
   */
  allowedTracingUrls?: Array<MatchOption | TracingOption> | undefined

  /**
   * The percentage of requests to trace: 100 for all, 0 for none.
   * See [Connect RUM and Traces](https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum) for further information.
   *
   * @category Tracing
   */
  traceSampleRate?: number | undefined
  /**
   * If you set a `traceSampleRate`, to ensure backend services' sampling decisions are still applied, configure the `traceContextInjection` initialization parameter to sampled.
   *
   * See [Connect RUM and Traces](https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum) for further information.
   *
   * @category Tracing
   * @defaultValue sampled
   */
  traceContextInjection?: TraceContextInjection | undefined

  // replay options
  /**
   * Allow to protect end user privacy and prevent sensitive organizational information from being collected.
   *
   * See [Replay Privacy Options](https://docs.datadoghq.com/real_user_monitoring/session_replay/browser/privacy_options) for further information.
   *
   * @category Privacy
   * @defaultValue mask
   */
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined

  /**
   * If you are accessing Datadog through a custom subdomain, you can set `subdomain` to include your custom domain in the `getSessionReplayLink()` returned URL .
   *
   * See [Connect Session Replay To Your Third-Party Tools](https://docs.datadoghq.com/real_user_monitoring/guide/connect-session-replay-to-your-third-party-tools) for further information.
   *
   */
  subdomain?: string

  /**
   * The percentage of tracked sessions with [Browser RUM & Session Replay pricing](https://www.datadoghq.com/pricing/?product=real-user-monitoring--session-replay#real-user-monitoring--session-replay) features: 100 for all, 0 for none.
   *
   * See [Configure Your Setup For Browser RUM and Browser RUM & Session Replay Sampling](https://docs.datadoghq.com/real_user_monitoring/guide/sampling-browser-plans) for further information.
   *
   * @category Session Replay
   */
  sessionReplaySampleRate?: number | undefined

  /**
   * If the session is sampled for Session Replay, only start the recording when `startSessionReplayRecording()` is called, instead of at the beginning of the session. Default: if startSessionReplayRecording is 0, true; otherwise, false.
   *
   * See [Session Replay Usage](https://docs.datadoghq.com/real_user_monitoring/session_replay/browser/#usage) for further information.
   *
   * @category Session Replay
   */
  startSessionReplayRecordingManually?: boolean | undefined

  /**
   * Enables privacy control for action names.
   *
   * @category Privacy
   */
  enablePrivacyForActionName?: boolean | undefined // TODO next major: remove this option and make privacy for action name the default behavior

  /**
   * Enables automatic collection of users actions.
   *
   * See [Tracking User Actions](https://docs.datadoghq.com/real_user_monitoring/browser/tracking_user_actions) for further information.
   *
   * @category Data Collection
   * @defaultValue true
   */
  trackUserInteractions?: boolean | undefined

  /**
   * Specify your own attribute to use to name actions.
   *
   * See [Declare a name for click actions](https://docs.datadoghq.com/real_user_monitoring/browser/tracking_user_actions/#declare-a-name-for-click-actions) for further information.
   *
   * @category Data Collection
   */
  actionNameAttribute?: string | undefined

  // view options
  /**
   * Allows you to control RUM views creation. See [Override default RUM view names](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/?tab=npm#override-default-rum-view-names) for further information.
   *
   * @category Data Collection
   */
  trackViewsManually?: boolean | undefined

  /**
   * Enable the creation of dedicated views for pages restored from the Back-Forward cache.
   *
   * @category Data Collection
   * @defaultValue false
   */
  trackBfcacheViews?: boolean | undefined

  /**
   * Enables collection of resource events.
   *
   * @category Data Collection
   * @defaultValue true
   */
  trackResources?: boolean | undefined

  /**
   * Enables collection of long task events.
   *
   * @category Data Collection
   * @defaultValue true
   */
  trackLongTasks?: boolean | undefined

  /**
   * Enables early request collection before resource timing entries are available.
   *
   * @category Data Collection
   * @defaultValue false
   */
  trackEarlyRequests?: boolean | undefined

  /**
   * List of plugins to enable. The plugins API is unstable and experimental, and may change without
   * notice. Please use only plugins provided by Datadog matching the version of the SDK you are
   * using.
   */
  plugins?: RumPlugin[] | undefined

  /**
   * Enables collection of features flags in additional events (e.g. long task, resource, action, vital).
   *
   * @category Data Collection
   */
  trackFeatureFlagsForEvents?: FeatureFlagsForEvents[]

  /**
   * The percentage of users profiled. A value between 0 and 100.
   *
   * @category Profiling
   * @defaultValue 0
   */
  profilingSampleRate?: number | undefined

  /**
   * A list of GraphQL endpoint URLs to track and enrich with GraphQL-specific metadata.
   *
   * @category Data Collection
   */
  allowedGraphQlUrls?: Array<MatchOption | GraphQlUrlOption> | undefined
}

export type HybridInitConfiguration = Omit<RumInitConfiguration, 'applicationId' | 'clientToken'>

export type FeatureFlagsForEvents = 'vital' | 'action' | 'long_task' | 'resource'

export interface GraphQlUrlOption {
  match: MatchOption
  trackPayload?: boolean
  trackResponseErrors?: boolean
}

export interface RumConfiguration extends Configuration {
  // Built from init configuration
  actionNameAttribute: string | undefined
  traceSampleRate: number
  rulePsr: number | undefined
  allowedTracingUrls: TracingOption[]
  excludedActivityUrls: MatchOption[]
  workerUrl: string | undefined
  compressIntakeRequests: boolean
  applicationId: string
  defaultPrivacyLevel: DefaultPrivacyLevel
  enablePrivacyForActionName: boolean
  sessionReplaySampleRate: number
  startSessionReplayRecordingManually: boolean
  trackUserInteractions: boolean
  trackViewsManually: boolean
  trackResources: boolean
  trackLongTasks: boolean
  trackBfcacheViews: boolean
  trackEarlyRequests: boolean
  subdomain?: string
  traceContextInjection: TraceContextInjection
  plugins: RumPlugin[]
  trackFeatureFlagsForEvents: FeatureFlagsForEvents[]
  profilingSampleRate: number
  propagateTraceBaggage: boolean
  allowedGraphQlUrls: GraphQlUrlOption[]
}

export function validateAndBuildRumConfiguration(
  initConfiguration: RumInitConfiguration,
  errorStack?: string
): RumConfiguration | undefined {
  if (
    initConfiguration.trackFeatureFlagsForEvents !== undefined &&
    !Array.isArray(initConfiguration.trackFeatureFlagsForEvents)
  ) {
    display.warn('trackFeatureFlagsForEvents should be an array')
  }

  if (!initConfiguration.applicationId) {
    display.error('Application ID is not configured, no RUM data will be collected.')
    return
  }

  if (
    !isSampleRate(initConfiguration.sessionReplaySampleRate, 'Session Replay') ||
    !isSampleRate(initConfiguration.traceSampleRate, 'Trace')
  ) {
    return
  }

  if (initConfiguration.excludedActivityUrls !== undefined && !Array.isArray(initConfiguration.excludedActivityUrls)) {
    display.error('Excluded Activity Urls should be an array')
    return
  }

  const allowedTracingUrls = validateAndBuildTracingOptions(initConfiguration)
  if (!allowedTracingUrls) {
    return
  }

  const baseConfiguration = validateAndBuildConfiguration(initConfiguration, errorStack)

  const allowedGraphQlUrls = validateAndBuildGraphQlOptions(initConfiguration)

  if (!baseConfiguration) {
    return
  }

  const sessionReplaySampleRate = initConfiguration.sessionReplaySampleRate ?? 0

  return {
    applicationId: initConfiguration.applicationId,
    actionNameAttribute: initConfiguration.actionNameAttribute,
    sessionReplaySampleRate,
    startSessionReplayRecordingManually:
      initConfiguration.startSessionReplayRecordingManually !== undefined
        ? !!initConfiguration.startSessionReplayRecordingManually
        : sessionReplaySampleRate === 0,
    traceSampleRate: initConfiguration.traceSampleRate ?? 100,
    rulePsr: isNumber(initConfiguration.traceSampleRate) ? initConfiguration.traceSampleRate / 100 : undefined,
    allowedTracingUrls,
    excludedActivityUrls: initConfiguration.excludedActivityUrls ?? [],
    workerUrl: initConfiguration.workerUrl,
    compressIntakeRequests: !!initConfiguration.compressIntakeRequests,
    trackUserInteractions: !!(initConfiguration.trackUserInteractions ?? true),
    trackViewsManually: !!initConfiguration.trackViewsManually,
    trackResources: !!(initConfiguration.trackResources ?? true),
    trackLongTasks: !!(initConfiguration.trackLongTasks ?? true),
    trackBfcacheViews: !!initConfiguration.trackBfcacheViews,
    trackEarlyRequests: !!initConfiguration.trackEarlyRequests,
    subdomain: initConfiguration.subdomain,
    defaultPrivacyLevel: objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel)
      ? initConfiguration.defaultPrivacyLevel
      : DefaultPrivacyLevel.MASK,
    enablePrivacyForActionName: !!initConfiguration.enablePrivacyForActionName,
    traceContextInjection: objectHasValue(TraceContextInjection, initConfiguration.traceContextInjection)
      ? initConfiguration.traceContextInjection
      : TraceContextInjection.SAMPLED,
    plugins: initConfiguration.plugins || [],
    trackFeatureFlagsForEvents: initConfiguration.trackFeatureFlagsForEvents || [],
    profilingSampleRate: initConfiguration.profilingSampleRate ?? 0,
    propagateTraceBaggage: !!initConfiguration.propagateTraceBaggage,
    allowedGraphQlUrls,
    ...baseConfiguration,
  }
}

/**
 * Validates allowedTracingUrls and converts match options to tracing options
 */
function validateAndBuildTracingOptions(initConfiguration: RumInitConfiguration): TracingOption[] | undefined {
  if (initConfiguration.allowedTracingUrls === undefined) {
    return []
  }
  if (!Array.isArray(initConfiguration.allowedTracingUrls)) {
    display.error('Allowed Tracing URLs should be an array')
    return
  }
  if (initConfiguration.allowedTracingUrls.length !== 0 && initConfiguration.service === undefined) {
    display.error('Service needs to be configured when tracing is enabled')
    return
  }
  // Convert from (MatchOption | TracingOption) to TracingOption, remove unknown properties
  const tracingOptions: TracingOption[] = []
  initConfiguration.allowedTracingUrls.forEach((option) => {
    if (isMatchOption(option)) {
      tracingOptions.push({ match: option, propagatorTypes: DEFAULT_PROPAGATOR_TYPES })
    } else if (isTracingOption(option)) {
      tracingOptions.push(option)
    } else {
      display.warn(
        'Allowed Tracing Urls parameters should be a string, RegExp, function, or an object. Ignoring parameter',
        option
      )
    }
  })

  return tracingOptions
}

/**
 * Combines the selected tracing propagators from the different options in allowedTracingUrls
 */
function getSelectedTracingPropagators(configuration: RumInitConfiguration): PropagatorType[] {
  const usedTracingPropagators = new Set<PropagatorType>()

  if (isNonEmptyArray(configuration.allowedTracingUrls)) {
    configuration.allowedTracingUrls.forEach((option) => {
      if (isMatchOption(option)) {
        DEFAULT_PROPAGATOR_TYPES.forEach((propagatorType) => usedTracingPropagators.add(propagatorType))
      } else if (getType(option) === 'object' && Array.isArray(option.propagatorTypes)) {
        // Ensure we have an array, as we cannot rely on types yet (configuration is provided by users)
        option.propagatorTypes.forEach((propagatorType) => usedTracingPropagators.add(propagatorType))
      }
    })
  }

  return Array.from(usedTracingPropagators)
}

/**
 * Build GraphQL options from configuration
 */
function validateAndBuildGraphQlOptions(initConfiguration: RumInitConfiguration): GraphQlUrlOption[] {
  if (!initConfiguration.allowedGraphQlUrls) {
    return []
  }

  if (!Array.isArray(initConfiguration.allowedGraphQlUrls)) {
    display.warn('allowedGraphQlUrls should be an array')
    return []
  }

  const graphQlOptions: GraphQlUrlOption[] = []

  initConfiguration.allowedGraphQlUrls.forEach((option) => {
    if (isMatchOption(option)) {
      graphQlOptions.push({ match: option, trackPayload: false, trackResponseErrors: false })
    } else if (option && typeof option === 'object' && 'match' in option && isMatchOption(option.match)) {
      graphQlOptions.push({
        match: option.match,
        trackPayload: !!option.trackPayload,
        trackResponseErrors: !!option.trackResponseErrors,
      })
    }
  })

  return graphQlOptions
}

function hasGraphQlPayloadTracking(allowedGraphQlUrls: RumInitConfiguration['allowedGraphQlUrls']): boolean {
  return (
    isNonEmptyArray(allowedGraphQlUrls) &&
    allowedGraphQlUrls.some((option) => {
      if (typeof option === 'object' && 'trackPayload' in option) {
        return !!option.trackPayload
      }
      return false
    })
  )
}

function hasGraphQlResponseErrorsTracking(allowedGraphQlUrls: RumInitConfiguration['allowedGraphQlUrls']): boolean {
  return (
    isNonEmptyArray(allowedGraphQlUrls) &&
    allowedGraphQlUrls.some((option) => {
      if (typeof option === 'object' && 'trackResponseErrors' in option) {
        return !!option.trackResponseErrors
      }
      return false
    })
  )
}

export function serializeRumConfiguration(configuration: RumInitConfiguration) {
  const baseSerializedConfiguration = serializeConfiguration(configuration)

  return {
    session_replay_sample_rate: configuration.sessionReplaySampleRate,
    start_session_replay_recording_manually: configuration.startSessionReplayRecordingManually,
    trace_sample_rate: configuration.traceSampleRate,
    trace_context_injection: configuration.traceContextInjection,
    propagate_trace_baggage: configuration.propagateTraceBaggage,
    action_name_attribute: configuration.actionNameAttribute,
    use_allowed_tracing_urls: isNonEmptyArray(configuration.allowedTracingUrls),
    use_allowed_graph_ql_urls: isNonEmptyArray(configuration.allowedGraphQlUrls),
    use_track_graph_ql_payload: hasGraphQlPayloadTracking(configuration.allowedGraphQlUrls),
    use_track_graph_ql_response_errors: hasGraphQlResponseErrorsTracking(configuration.allowedGraphQlUrls),
    selected_tracing_propagators: getSelectedTracingPropagators(configuration),
    default_privacy_level: configuration.defaultPrivacyLevel,
    enable_privacy_for_action_name: configuration.enablePrivacyForActionName,
    use_excluded_activity_urls: isNonEmptyArray(configuration.excludedActivityUrls),
    use_worker_url: !!configuration.workerUrl,
    compress_intake_requests: configuration.compressIntakeRequests,
    track_views_manually: configuration.trackViewsManually,
    track_user_interactions: configuration.trackUserInteractions,
    track_resources: configuration.trackResources,
    track_long_task: configuration.trackLongTasks,
    track_bfcache_views: configuration.trackBfcacheViews,
    track_early_requests: configuration.trackEarlyRequests,
    plugins: configuration.plugins?.map((plugin) => ({
      name: plugin.name,
      ...plugin.getConfigurationTelemetry?.(),
    })),
    track_feature_flags_for_events: configuration.trackFeatureFlagsForEvents,
    remote_configuration_id: configuration.remoteConfigurationId,
    profiling_sample_rate: configuration.profilingSampleRate,
    use_remote_configuration_proxy: !!configuration.remoteConfigurationProxy,
    ...baseSerializedConfiguration,
  } satisfies RawTelemetryConfiguration
}
