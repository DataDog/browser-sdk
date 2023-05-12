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

export interface RumInitConfiguration extends InitConfiguration {
  // global options
  applicationId: string
  beforeSend?: ((event: RumEvent, context: RumEventDomainContext) => void | boolean) | undefined
  /**
   * @deprecated use sessionReplaySampleRate instead
   */
  premiumSampleRate?: number | undefined
  excludedActivityUrls?: MatchOption[] | undefined

  // tracing options
  allowedTracingUrls?: Array<MatchOption | TracingOption> | undefined
  traceSampleRate?: number | undefined

  // replay options
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined
  subdomain?: string
  /**
   * @deprecated use sessionReplaySampleRate instead
   */
  replaySampleRate?: number | undefined
  sessionReplaySampleRate?: number | undefined

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
  applicationId: string
  defaultPrivacyLevel: DefaultPrivacyLevel
  oldPlansBehavior: boolean
  sessionReplaySampleRate: number
  trackUserInteractions: boolean
  trackViewsManually: boolean
  trackResources: boolean | undefined
  trackLongTasks: boolean | undefined
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

  // TODO remove fallback in next major
  let premiumSampleRate = initConfiguration.premiumSampleRate ?? initConfiguration.replaySampleRate
  if (premiumSampleRate !== undefined && initConfiguration.sessionReplaySampleRate !== undefined) {
    display.warn('Ignoring Premium Sample Rate because Session Replay Sample Rate is set')
    premiumSampleRate = undefined
  }

  if (premiumSampleRate !== undefined && !isPercentage(premiumSampleRate)) {
    display.error('Premium Sample Rate should be a number between 0 and 100')
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
      sessionReplaySampleRate: initConfiguration.sessionReplaySampleRate ?? premiumSampleRate ?? 100,
      oldPlansBehavior: initConfiguration.sessionReplaySampleRate === undefined,
      traceSampleRate: initConfiguration.traceSampleRate,
      allowedTracingUrls,
      excludedActivityUrls: initConfiguration.excludedActivityUrls ?? [],
      trackUserInteractions: !!initConfiguration.trackUserInteractions,
      trackViewsManually: !!initConfiguration.trackViewsManually,
      trackResources: initConfiguration.trackResources,
      trackLongTasks: initConfiguration.trackLongTasks,
      subdomain: initConfiguration.subdomain,
      defaultPrivacyLevel: objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel)
        ? initConfiguration.defaultPrivacyLevel
        : DefaultPrivacyLevel.MASK_USER_INPUT,
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
        tracingOptions.push({ match: option, propagatorTypes: ['datadog'] })
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
        usedTracingPropagators.add('datadog')
      } else if (getType(option) === 'object' && Array.isArray(option.propagatorTypes)) {
        // Ensure we have an array, as we cannot rely on types yet (configuration is provided by users)
        option.propagatorTypes.forEach((propagatorType) => usedTracingPropagators.add(propagatorType))
      }
    })
  }

  return arrayFrom(usedTracingPropagators)
}

export function serializeRumConfiguration(configuration: RumInitConfiguration): RawTelemetryConfiguration {
  const baseSerializedConfiguration = serializeConfiguration(configuration)

  return assign(
    {
      premium_sample_rate: configuration.premiumSampleRate,
      replay_sample_rate: configuration.replaySampleRate,
      session_replay_sample_rate: configuration.sessionReplaySampleRate,
      trace_sample_rate: configuration.traceSampleRate,
      action_name_attribute: configuration.actionNameAttribute,
      use_allowed_tracing_urls:
        Array.isArray(configuration.allowedTracingUrls) && configuration.allowedTracingUrls.length > 0,
      selected_tracing_propagators: getSelectedTracingPropagators(configuration),
      default_privacy_level: configuration.defaultPrivacyLevel,
      use_excluded_activity_urls:
        Array.isArray(configuration.excludedActivityUrls) && configuration.excludedActivityUrls.length > 0,
      track_views_manually: configuration.trackViewsManually,
      track_user_interactions: configuration.trackUserInteractions,
    },
    baseSerializedConfiguration
  )
}
