import type { Configuration, InitConfiguration, MatchOption, RawTelemetryConfiguration } from '@datadog/browser-core'
import {
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
  allowedTracingOrigins?: MatchOption[] | undefined
  tracingSampleRate?: number | undefined

  // replay options
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined
  /**
   * @deprecated use sessionReplaySampleRate instead
   */
  replaySampleRate?: number | undefined
  sessionReplaySampleRate?: number | undefined

  // action options
  trackInteractions?: boolean | undefined
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
  allowedTracingOrigins: MatchOption[]
  tracingSampleRate: number | undefined
  excludedActivityUrls: MatchOption[]
  applicationId: string
  defaultPrivacyLevel: DefaultPrivacyLevel
  oldPlansBehavior: boolean
  sessionReplaySampleRate: number
  trackInteractions: boolean
  trackFrustrations: boolean
  trackViewsManually: boolean
  trackResources: boolean | undefined
  trackLongTasks: boolean | undefined
  version?: string
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

  if (initConfiguration.tracingSampleRate !== undefined && !isPercentage(initConfiguration.tracingSampleRate)) {
    display.error('Tracing Sample Rate should be a number between 0 and 100')
    return
  }

  if (initConfiguration.allowedTracingOrigins !== undefined) {
    if (!Array.isArray(initConfiguration.allowedTracingOrigins)) {
      display.error('Allowed Tracing Origins should be an array')
      return
    }
    if (initConfiguration.allowedTracingOrigins.length !== 0 && initConfiguration.service === undefined) {
      display.error('Service need to be configured when tracing is enabled')
      return
    }
  }

  if (initConfiguration.excludedActivityUrls !== undefined && !Array.isArray(initConfiguration.excludedActivityUrls)) {
    display.error('Excluded Activity Urls should be an array')
    return
  }

  const baseConfiguration = validateAndBuildConfiguration(initConfiguration)
  if (!baseConfiguration) {
    return
  }

  const trackFrustrations = !!initConfiguration.trackFrustrations

  return assign(
    {
      applicationId: initConfiguration.applicationId,
      version: initConfiguration.version,
      actionNameAttribute: initConfiguration.actionNameAttribute,
      sessionReplaySampleRate: initConfiguration.sessionReplaySampleRate ?? premiumSampleRate ?? 100,
      oldPlansBehavior: initConfiguration.sessionReplaySampleRate === undefined,
      allowedTracingOrigins: initConfiguration.allowedTracingOrigins ?? [],
      tracingSampleRate: initConfiguration.tracingSampleRate,
      excludedActivityUrls: initConfiguration.excludedActivityUrls ?? [],
      trackInteractions: !!initConfiguration.trackInteractions || trackFrustrations,
      trackFrustrations,
      trackViewsManually: !!initConfiguration.trackViewsManually,
      trackResources: initConfiguration.trackResources,
      trackLongTasks: initConfiguration.trackLongTasks,
      defaultPrivacyLevel: objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel)
        ? initConfiguration.defaultPrivacyLevel
        : DefaultPrivacyLevel.MASK_USER_INPUT,
    },
    baseConfiguration
  )
}

export function serializeRumConfiguration(configuration: RumInitConfiguration): RawTelemetryConfiguration {
  const baseSerializedConfiguration = serializeConfiguration(configuration)

  return assign(
    {
      premium_sample_rate: configuration.premiumSampleRate,
      replay_sample_rate: configuration.replaySampleRate,
      session_replay_sample_rate: configuration.sessionReplaySampleRate,
      trace_sample_rate: configuration.tracingSampleRate,
      action_name_attribute: configuration.actionNameAttribute,
      use_allowed_tracing_origins:
        Array.isArray(configuration.allowedTracingOrigins) && configuration.allowedTracingOrigins.length > 0,
      default_privacy_level: configuration.defaultPrivacyLevel,
      use_excluded_activity_urls:
        Array.isArray(configuration.allowedTracingOrigins) && configuration.allowedTracingOrigins.length > 0,
      track_frustrations: configuration.trackFrustrations,
      track_views_manually: configuration.trackViewsManually,
      track_interactions: configuration.trackInteractions,
    },
    baseSerializedConfiguration
  )
}
