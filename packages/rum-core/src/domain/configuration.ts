import type { Configuration, InitConfiguration, MatchOption, RawTelemetryConfiguration } from '@datadog/browser-core'
import {
  getType,
  arrayFrom,
  getOrigin,
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
  /**
   * @deprecated use allowedTracingUrls instead
   */
  allowedTracingOrigins?: MatchOption[] | undefined
  allowedTracingUrls?: Array<MatchOption | TracingOption> | undefined
  /**
   * @deprecated use traceSampleRate instead
   */
  tracingSampleRate?: number | undefined
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
  /**
   * @deprecated use trackUserInteractions instead
   */
  trackInteractions?: boolean | undefined
  trackUserInteractions?: boolean | undefined
  trackFrustrations?: boolean | undefined
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
  trackFrustrations: boolean
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

  const traceSampleRate = initConfiguration.traceSampleRate ?? initConfiguration.tracingSampleRate
  if (traceSampleRate !== undefined && !isPercentage(traceSampleRate)) {
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

  const trackUserInteractions = !!(initConfiguration.trackUserInteractions ?? initConfiguration.trackInteractions)
  const trackFrustrations = !!initConfiguration.trackFrustrations

  return assign(
    {
      applicationId: initConfiguration.applicationId,
      version: initConfiguration.version,
      actionNameAttribute: initConfiguration.actionNameAttribute,
      sessionReplaySampleRate: initConfiguration.sessionReplaySampleRate ?? premiumSampleRate ?? 100,
      oldPlansBehavior: initConfiguration.sessionReplaySampleRate === undefined,
      traceSampleRate,
      allowedTracingUrls,
      excludedActivityUrls: initConfiguration.excludedActivityUrls ?? [],
      trackUserInteractions: trackUserInteractions || trackFrustrations,
      trackFrustrations,
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
 * Handles allowedTracingUrls and processes legacy allowedTracingOrigins
 */
function validateAndBuildTracingOptions(initConfiguration: RumInitConfiguration): TracingOption[] | undefined {
  // Advise about parameters precedence.
  if (initConfiguration.allowedTracingUrls !== undefined && initConfiguration.allowedTracingOrigins !== undefined) {
    display.warn(
      'Both allowedTracingUrls and allowedTracingOrigins (deprecated) have been defined. The parameter allowedTracingUrls will override allowedTracingOrigins.'
    )
  }
  // Handle allowedTracingUrls first
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

  // Handle conversion of allowedTracingOrigins to allowedTracingUrls
  if (initConfiguration.allowedTracingOrigins !== undefined) {
    if (!Array.isArray(initConfiguration.allowedTracingOrigins)) {
      display.error('Allowed Tracing Origins should be an array')
      return
    }
    if (initConfiguration.allowedTracingOrigins.length !== 0 && initConfiguration.service === undefined) {
      display.error('Service needs to be configured when tracing is enabled')
      return
    }

    const tracingOptions: TracingOption[] = []
    initConfiguration.allowedTracingOrigins.forEach((legacyMatchOption) => {
      const tracingOption = convertLegacyMatchOptionToTracingOption(legacyMatchOption)
      if (tracingOption) {
        tracingOptions.push(tracingOption)
      }
    })
    return tracingOptions
  }

  return []
}

/**
 * Converts parameters from the deprecated allowedTracingOrigins
 * to allowedTracingUrls. Handles the change from origin to full URLs.
 */
function convertLegacyMatchOptionToTracingOption(item: MatchOption): TracingOption | undefined {
  let match: MatchOption | undefined
  if (typeof item === 'string') {
    match = item
  } else if (item instanceof RegExp) {
    match = (url) => item.test(getOrigin(url))
  } else if (typeof item === 'function') {
    match = (url) => item(getOrigin(url))
  }

  if (match === undefined) {
    display.warn('Allowed Tracing Origins parameters should be a string, RegExp or function. Ignoring parameter', item)
    return undefined
  }

  return { match, propagatorTypes: ['datadog'] }
}

/**
 * Combines the selected tracing propagators from the different options in allowedTracingUrls,
 * and assumes 'datadog' has been selected when using allowedTracingOrigins
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

  if (Array.isArray(configuration.allowedTracingOrigins) && configuration.allowedTracingOrigins.length > 0) {
    usedTracingPropagators.add('datadog')
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
      trace_sample_rate: configuration.traceSampleRate ?? configuration.tracingSampleRate,
      action_name_attribute: configuration.actionNameAttribute,
      use_allowed_tracing_origins:
        Array.isArray(configuration.allowedTracingOrigins) && configuration.allowedTracingOrigins.length > 0,
      use_allowed_tracing_urls:
        Array.isArray(configuration.allowedTracingUrls) && configuration.allowedTracingUrls.length > 0,
      selected_tracing_propagators: getSelectedTracingPropagators(configuration),
      default_privacy_level: configuration.defaultPrivacyLevel,
      use_excluded_activity_urls:
        Array.isArray(configuration.allowedTracingOrigins) && configuration.allowedTracingOrigins.length > 0,
      track_frustrations: configuration.trackFrustrations,
      track_views_manually: configuration.trackViewsManually,
      track_user_interactions: configuration.trackUserInteractions ?? configuration.trackInteractions,
    },
    baseSerializedConfiguration
  )
}
