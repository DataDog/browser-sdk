import type { Configuration, InitConfiguration, MatchOption, RawTelemetryConfiguration } from '@datadog/browser-core'
import {
  getType,
  arrayFrom,
  isMatchOption,
  serializeConfiguration,
  assign,
  DefaultPrivacyLevel,
  display,
  isPercentage,
  objectHasValue,
  validateAndBuildConfiguration,
} from '@datadog/browser-core'
import type { RumEventDomainContext } from '../domainContext.types'
import type { RumEvent } from '../rumEvent.types'
import { isTracingOption } from './tracing/tracer'
import type { PropagatorType, TracingOption } from './tracing/tracer.types'

export const DEFAULT_PROPAGATOR_TYPES: PropagatorType[] = ['tracecontext', 'datadog']

export interface RumInitConfiguration extends InitConfiguration {
  // global options
  applicationId: string
  beforeSend?: ((event: RumEvent, context: RumEventDomainContext) => boolean) | undefined
  excludedActivityUrls?: MatchOption[] | undefined
  workerUrl?: string
  compressIntakeRequests?: boolean | undefined

  // tracing options
  allowedTracingUrls?: Array<MatchOption | TracingOption> | undefined
  traceSampleRate?: number | undefined

  // replay options
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined
  subdomain?: string
  sessionReplaySampleRate?: number | undefined
  startSessionReplayRecordingManually?: boolean | undefined

  // action options
  trackUserInteractions?: boolean | undefined
  actionNameAttribute?: string | undefined

  // view options
  trackViewsManually?: boolean | undefined

  trackResources?: boolean | undefined
  trackLongTasks?: boolean | undefined
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
  sessionReplaySampleRate: number
  startSessionReplayRecordingManually: boolean
  trackUserInteractions: boolean
  trackViewsManually: boolean
  trackResources: boolean
  trackLongTasks: boolean
  version?: string
  subdomain?: string
  customerDataTelemetrySampleRate: number
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
      version: initConfiguration.version,
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
      customerDataTelemetrySampleRate: 1,
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
      action_name_attribute: configuration.actionNameAttribute,
      use_allowed_tracing_urls:
        Array.isArray(configuration.allowedTracingUrls) && configuration.allowedTracingUrls.length > 0,
      selected_tracing_propagators: getSelectedTracingPropagators(configuration),
      default_privacy_level: configuration.defaultPrivacyLevel,
      use_excluded_activity_urls:
        Array.isArray(configuration.excludedActivityUrls) && configuration.excludedActivityUrls.length > 0,
      use_worker_url: !!configuration.workerUrl,
      compress_intake_requests: configuration.compressIntakeRequests,
      track_views_manually: configuration.trackViewsManually,
      track_user_interactions: configuration.trackUserInteractions,
      track_resources: configuration.trackResources,
      track_long_task: configuration.trackLongTasks,
    },
    baseSerializedConfiguration
  ) satisfies RawTelemetryConfiguration
}
