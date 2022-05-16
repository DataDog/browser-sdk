import type { Configuration, InitConfiguration } from '@datadog/browser-core'
import {
  isExperimentalFeatureEnabled,
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
  premiumSampleRate?: number | undefined

  // tracing options
  allowedTracingOrigins?: ReadonlyArray<string | RegExp> | undefined

  // replay options
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined
  /**
   * @deprecated use premiumSampleRate instead
   */
  replaySampleRate?: number | undefined

  // action options
  trackInteractions?: boolean | undefined
  trackFrustrations?: boolean | undefined
  actionNameAttribute?: string | undefined

  // view options
  trackViewsManually?: boolean | undefined
}

export type HybridInitConfiguration = Omit<RumInitConfiguration, 'applicationId' | 'clientToken'>

export interface RumConfiguration extends Configuration {
  // Built from init configuration
  actionNameAttribute: string | undefined
  allowedTracingOrigins: Array<string | RegExp>
  applicationId: string
  defaultPrivacyLevel: DefaultPrivacyLevel
  premiumSampleRate: number
  trackInteractions: boolean
  trackFrustrations: boolean
  trackViewsManually: boolean
  version?: string
}

export function validateAndBuildRumConfiguration(
  initConfiguration: RumInitConfiguration
): RumConfiguration | undefined {
  if (!initConfiguration.applicationId) {
    display.error('Application ID is not configured, no RUM data will be collected.')
    return
  }

  // TODO remove me in next major
  if (initConfiguration.replaySampleRate !== undefined && initConfiguration.premiumSampleRate === undefined) {
    initConfiguration.premiumSampleRate = initConfiguration.replaySampleRate
  }

  if (initConfiguration.premiumSampleRate !== undefined && !isPercentage(initConfiguration.premiumSampleRate)) {
    display.error('Premium Sample Rate should be a number between 0 and 100')
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

  const baseConfiguration = validateAndBuildConfiguration(initConfiguration)
  if (!baseConfiguration) {
    return
  }

  const trackFrustrations = isExperimentalFeatureEnabled('frustration-signals') && !!initConfiguration.trackFrustrations

  return assign(
    {
      applicationId: initConfiguration.applicationId,
      version: initConfiguration.version,
      actionNameAttribute: initConfiguration.actionNameAttribute,
      premiumSampleRate: initConfiguration.premiumSampleRate ?? 100,
      allowedTracingOrigins: initConfiguration.allowedTracingOrigins ?? [],
      trackInteractions: !!initConfiguration.trackInteractions || trackFrustrations,
      trackFrustrations,
      trackViewsManually: !!initConfiguration.trackViewsManually,
      defaultPrivacyLevel: objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel)
        ? initConfiguration.defaultPrivacyLevel
        : DefaultPrivacyLevel.MASK_USER_INPUT,
    },
    baseConfiguration
  )
}
