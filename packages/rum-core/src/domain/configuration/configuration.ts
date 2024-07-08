import type { Configuration, InitConfiguration, MatchOption, RawTelemetryConfiguration } from '@datadog/browser-core'
import {
  getType,
  arrayFrom,
  isMatchOption,
  serializeConfiguration,
  assign,
  DefaultPrivacyLevel,
  TraceContextInjection,
  display,
  isPercentage,
  objectHasValue,
  validateAndBuildConfiguration,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
} from '@datadog/browser-core'
import type { RumEventDomainContext } from '../../domainContext.types'
import type { RumEvent } from '../../rumEvent.types'
import type { RumPlugin } from '../plugins'
import { isTracingOption } from '../tracing/tracer'
import type { PropagatorType, TracingOption } from '../tracing/tracer.types'

export const DEFAULT_PROPAGATOR_TYPES: PropagatorType[] = ['tracecontext', 'datadog']

export interface RumInitConfiguration extends InitConfiguration {
  // global options
  /**
   * The RUM application ID.
   */
  applicationId: string
  /**
   * Access to every event collected by the RUM SDK before they are sent to Datadog.
   * It allows:
   * - Enrich your RUM events with additional context attributes
   * - Modify your RUM events to modify their content, or redact sensitive sequences (see the list of editable properties)
   * - Discard selected RUM events
   *
   * See [Enrich And Control Browser RUM Data With beforeSend](https://docs.datadoghq.com/real_user_monitoring/guide/enrich-and-control-rum-data) for further information.
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
   */
  workerUrl?: string
  /**
   * Compress requests sent to the Datadog intake to reduce bandwidth usage when sending large amounts of data. The compression is done in a Worker thread.
   * See [Content Security Policy guidelines](https://docs.datadoghq.com/integrations/content_security_policy_logs/?tab=firefox#use-csp-with-real-user-monitoring-and-session-replay) for further information.
   */
  compressIntakeRequests?: boolean | undefined
  remoteConfigurationId?: string | undefined

  // tracing options
  /**
   * A list of request URLs used to inject tracing headers.
   * See [Connect RUM and Traces](https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum) for further information.
   */
  allowedTracingUrls?: Array<MatchOption | TracingOption> | undefined

  /**
   * The percentage of requests to trace: 100 for all, 0 for none.
   * See [Connect RUM and Traces](https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum) for further information.
   */
  traceSampleRate?: number | undefined
  /**
   * If you set a `traceSampleRate`, to ensure backend services' sampling decisions are still applied, configure the `traceContextInjection` initialization parameter to sampled.
   * @default all
   * See [Connect RUM and Traces](https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum) for further information.
   */
  traceContextInjection?: TraceContextInjection | undefined

  // replay options
  /**
   * Allow to protect end user privacy and prevent sensitive organizational information from being collected.
   * @default mask
   * See [Replay Privacy Options](https://docs.datadoghq.com/real_user_monitoring/session_replay/browser/privacy_options) for further information.
   */
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined
  /**
   * If you are accessing Datadog through a custom subdomain, you can set `subdomain` to include your custom domain in the `getSessionReplayLink()` returned URL .
   * See [Connect Session Replay To Your Third-Party Tools](https://docs.datadoghq.com/real_user_monitoring/guide/connect-session-replay-to-your-third-party-tools) for further information.
   */
  subdomain?: string
  /**
   * The percentage of tracked sessions with [Browser RUM & Session Replay pricing](https://www.datadoghq.com/pricing/?product=real-user-monitoring--session-replay#real-user-monitoring--session-replay) features: 100 for all, 0 for none.
   * See [Configure Your Setup For Browser RUM and Browser RUM & Session Replay Sampling](https://docs.datadoghq.com/real_user_monitoring/guide/sampling-browser-plans) for further information.
   */
  sessionReplaySampleRate?: number | undefined
  /**
   * If the session is sampled for Session Replay, only start the recording when `startSessionReplayRecording()` is called, instead of at the beginning of the session.
   * See [Session Replay Usage](https://docs.datadoghq.com/real_user_monitoring/session_replay/browser/#usage) for further information.
   */
  startSessionReplayRecordingManually?: boolean | undefined

  /**
   * Enables privacy control for action names.
   */
  enablePrivacyForActionName?: boolean | undefined // TODO next major: remove this option and make privacy for action name the default behavior
  /**
   * Enables automatic collection of users actions.
   * See [Tracking User Actions](https://docs.datadoghq.com/real_user_monitoring/browser/tracking_user_actions) for further information.
   */
  trackUserInteractions?: boolean | undefined
  /**
   * Specify your own attribute to use to name actions.
   * See [Declare a name for click actions](https://docs.datadoghq.com/real_user_monitoring/browser/tracking_user_actions/#declare-a-name-for-click-actions) for further information.
   */
  actionNameAttribute?: string | undefined

  // view options
  /**
   * Allows you to control RUM views creation. See [Override default RUM view names](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/?tab=npm#override-default-rum-view-names) for further information.
   */
  trackViewsManually?: boolean | undefined
  /**
   * Enables collection of resource events.
   */
  trackResources?: boolean | undefined
  /**
   * Enables collection of long task events.
   */
  trackLongTasks?: boolean | undefined

  /**
   * List of plugins to enable. The plugins API is unstable and experimental, and may change without
   * notice. Please use only plugins provided by Datadog matching the version of the SDK you are
   * using.
   */
  plugins?: RumPlugin[] | undefined
}

export type HybridInitConfiguration = Omit<RumInitConfiguration, 'applicationId' | 'clientToken'>

export interface RumConfiguration extends Configuration {
  // Built from init configuration
  actionNameAttribute: string | undefined
  traceSampleRate: number | undefined
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
  version?: string
  subdomain?: string
  customerDataTelemetrySampleRate: number
  traceContextInjection: TraceContextInjection
  plugins: RumPlugin[]
}

export function validateAndBuildRumConfiguration(
  initConfiguration: RumInitConfiguration
): RumConfiguration | undefined {
  if (!initConfiguration.applicationId) {
    display.error('Application ID is not configured, no RUM data will be collected.')
    return
  }

  if (
    initConfiguration.sessionReplaySampleRate !== undefined &&
    !isPercentage(initConfiguration.sessionReplaySampleRate)
  ) {
    display.error('Session Replay Sample Rate should be a number between 0 and 100')
    return
  }

  if (initConfiguration.traceSampleRate !== undefined && !isPercentage(initConfiguration.traceSampleRate)) {
    display.error('Trace Sample Rate should be a number between 0 and 100')
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

  const baseConfiguration = validateAndBuildConfiguration(initConfiguration)
  if (!baseConfiguration) {
    return
  }

  return assign(
    {
      applicationId: initConfiguration.applicationId,
      version: initConfiguration.version || undefined,
      actionNameAttribute: initConfiguration.actionNameAttribute,
      sessionReplaySampleRate: initConfiguration.sessionReplaySampleRate ?? 0,
      startSessionReplayRecordingManually: !!initConfiguration.startSessionReplayRecordingManually,
      traceSampleRate: initConfiguration.traceSampleRate,
      allowedTracingUrls,
      excludedActivityUrls: initConfiguration.excludedActivityUrls ?? [],
      workerUrl: initConfiguration.workerUrl,
      compressIntakeRequests: !!initConfiguration.compressIntakeRequests,
      trackUserInteractions: !!initConfiguration.trackUserInteractions,
      trackViewsManually: !!initConfiguration.trackViewsManually,
      trackResources: !!initConfiguration.trackResources,
      trackLongTasks: !!initConfiguration.trackLongTasks,
      subdomain: initConfiguration.subdomain,
      defaultPrivacyLevel: objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel)
        ? initConfiguration.defaultPrivacyLevel
        : DefaultPrivacyLevel.MASK,
      enablePrivacyForActionName: !!initConfiguration.enablePrivacyForActionName,
      customerDataTelemetrySampleRate: 1,
      traceContextInjection: objectHasValue(TraceContextInjection, initConfiguration.traceContextInjection)
        ? initConfiguration.traceContextInjection
        : TraceContextInjection.ALL,
      plugins: (isExperimentalFeatureEnabled(ExperimentalFeature.PLUGINS) && initConfiguration.plugins) || [],
    },
    baseConfiguration
  )
}

/**
 * Validates allowedTracingUrls and converts match options to tracing options
 */
function validateAndBuildTracingOptions(initConfiguration: RumInitConfiguration): TracingOption[] | undefined {
  if (initConfiguration.allowedTracingUrls !== undefined) {
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

  return []
}

/**
 * Combines the selected tracing propagators from the different options in allowedTracingUrls
 */
function getSelectedTracingPropagators(configuration: RumInitConfiguration): PropagatorType[] {
  const usedTracingPropagators = new Set<PropagatorType>()

  if (Array.isArray(configuration.allowedTracingUrls) && configuration.allowedTracingUrls.length > 0) {
    configuration.allowedTracingUrls.forEach((option) => {
      if (isMatchOption(option)) {
        DEFAULT_PROPAGATOR_TYPES.forEach((propagatorType) => usedTracingPropagators.add(propagatorType))
      } else if (getType(option) === 'object' && Array.isArray(option.propagatorTypes)) {
        // Ensure we have an array, as we cannot rely on types yet (configuration is provided by users)
        option.propagatorTypes.forEach((propagatorType) => usedTracingPropagators.add(propagatorType))
      }
    })
  }

  return arrayFrom(usedTracingPropagators)
}

export function serializeRumConfiguration(configuration: RumInitConfiguration) {
  const baseSerializedConfiguration = serializeConfiguration(configuration)

  return assign(
    {
      session_replay_sample_rate: configuration.sessionReplaySampleRate,
      start_session_replay_recording_manually: configuration.startSessionReplayRecordingManually,
      trace_sample_rate: configuration.traceSampleRate,
      trace_context_injection: configuration.traceContextInjection,
      action_name_attribute: configuration.actionNameAttribute,
      use_allowed_tracing_urls:
        Array.isArray(configuration.allowedTracingUrls) && configuration.allowedTracingUrls.length > 0,
      selected_tracing_propagators: getSelectedTracingPropagators(configuration),
      default_privacy_level: configuration.defaultPrivacyLevel,
      enable_privacy_for_action_name: configuration.enablePrivacyForActionName,
      use_excluded_activity_urls:
        Array.isArray(configuration.excludedActivityUrls) && configuration.excludedActivityUrls.length > 0,
      use_worker_url: !!configuration.workerUrl,
      compress_intake_requests: configuration.compressIntakeRequests,
      track_views_manually: configuration.trackViewsManually,
      track_user_interactions: configuration.trackUserInteractions,
      track_resources: configuration.trackResources,
      track_long_task: configuration.trackLongTasks,
      plugins: configuration.plugins?.map((plugin) =>
        assign({ name: plugin.name }, plugin.getConfigurationTelemetry?.())
      ),
    },
    baseSerializedConfiguration
  ) satisfies RawTelemetryConfiguration
}
