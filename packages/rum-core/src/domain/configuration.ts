import type { Configuration, InitConfiguration, MatchOption, RawTelemetryConfiguration } from '@datadog/browser-core'
import {
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
import type { ConfigureTracingOption, TracingHeadersType } from './tracing/tracer.types'

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
   * @deprecated use configureTracingUrls instead
   */
  allowedTracingOrigins?: MatchOption[] | undefined
  configureTracingUrls?: Array<MatchOption | ConfigureTracingOption> | undefined
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
  tracingSampleRate: number | undefined
  configureTracingUrls: ConfigureTracingOption[]
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

  if (initConfiguration.excludedActivityUrls !== undefined && !Array.isArray(initConfiguration.excludedActivityUrls)) {
    display.error('Excluded Activity Urls should be an array')
    return
  }

  const configureTracingUrls = handleTracingParameters(initConfiguration)
  if (configureTracingUrls === undefined) {
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
      tracingSampleRate: initConfiguration.tracingSampleRate,
      configureTracingUrls,
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

/**
 * Handles configureTracingUrls and processes legacy allowedTracingOrigins
 */
function handleTracingParameters(initConfiguration: RumInitConfiguration): ConfigureTracingOption[] | undefined {
  // Advise about parameters precedence.
  if (initConfiguration.configureTracingUrls !== undefined && initConfiguration.allowedTracingOrigins !== undefined) {
    display.warn(
      'Both configureTracingUrls and allowedTracingOrigins (deprecated) have been defined. The parameter configureTracingUrls will override allowedTracingOrigins.'
    )
  }

  // Handle configureTracingUrls first
  if (initConfiguration.configureTracingUrls !== undefined) {
    if (!Array.isArray(initConfiguration.configureTracingUrls)) {
      display.error('Configure Tracing URLs should be an array')
      return
    }
    if (initConfiguration.configureTracingUrls.length !== 0 && initConfiguration.service === undefined) {
      display.error('Service needs to be configured when tracing is enabled')
      return
    }

    // Convert from MatchOption | TracingOption to TracingOption
    const configureTracingUrls: ConfigureTracingOption[] = []
    for (const option of initConfiguration.configureTracingUrls) {
      configureTracingUrls.push(
        isMatchOption(option) ? ({ match: option, headerTypes: ['dd'] } as ConfigureTracingOption) : option
      )
    }
    return configureTracingUrls
  }

  // Handle conversion of allowedTracingOrigins to configureTracingUrls
  if (initConfiguration.allowedTracingOrigins !== undefined) {
    if (!Array.isArray(initConfiguration.allowedTracingOrigins)) {
      display.error('Allowed Tracing Origins should be an array')
      return
    }
    if (initConfiguration.allowedTracingOrigins.length !== 0 && initConfiguration.service === undefined) {
      display.error('Service needs to be configured when tracing is enabled')
      return
    }

    return initConfiguration.allowedTracingOrigins.reduce((configArray, item) => {
      const option = convertLegacyMatchOptionToTracingOption(item)
      if (option) {
        configArray.push(option)
      }
      return configArray
    }, [] as ConfigureTracingOption[])
  }

  return []
}

/**
 * Converts parameters from the deprecated allowedTracingOrigins
 * to configureTracingUrls. Handles the change from origin to full URLs.
 */
function convertLegacyMatchOptionToTracingOption(item: MatchOption) {
  let match: MatchOption | undefined
  if (typeof item === 'string') {
    match = item
  }
  if (item instanceof RegExp) {
    match = (url) => item.test(getOrigin(url))
  }
  if (typeof item === 'function') {
    match = (url) => item(getOrigin(url))
  }

  if (match === undefined) {
    display.warn('Allowed Tracing Origins parameters should be a string, RegExp or function. Ignoring parameter', item)
    return undefined
  }

  return { match, headerTypes: ['dd'] } as ConfigureTracingOption
}

/**
 * Combines the selected tracing headers from the different options in configureTracingUrls,
 * and assumes 'dd' has been selected when using allowedTracingOrigins
 */
function getSelectedTracingHeaders(configuration: RumInitConfiguration): TracingHeadersType[] {
  const usedTracingHeaders = new Set<TracingHeadersType>()

  if (Array.isArray(configuration.configureTracingUrls) && configuration.configureTracingUrls.length > 0) {
    configuration.configureTracingUrls.forEach((config) => {
      if (isMatchOption(config)) {
        usedTracingHeaders.add('dd')
      } else if (Array.isArray(config.headerTypes)) {
        config.headerTypes.forEach((headerType) => usedTracingHeaders.add(headerType))
      }
    })
  }

  if (Array.isArray(configuration.allowedTracingOrigins) && configuration.allowedTracingOrigins.length > 0) {
    usedTracingHeaders.add('dd')
  }

  return arrayFrom(usedTracingHeaders)
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
      use_configure_tracing_urls:
        Array.isArray(configuration.configureTracingUrls) && configuration.configureTracingUrls.length > 0,
      selected_tracing_headers: getSelectedTracingHeaders(configuration),
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
