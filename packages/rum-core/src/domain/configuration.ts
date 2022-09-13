import type { Configuration, InitConfiguration } from '@datadog/browser-core'
import {
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
  excludedActivityUrls?: ReadonlyArray<string | RegExp> | undefined

  // tracing options
  allowedTracingOrigins?: ReadonlyArray<string | RegExp> | undefined
  tracingSampleRate?: number | undefined

  // replay options
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined
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
  tracingSampleRate: number | undefined
  excludedActivityUrls: Array<string | RegExp>
  applicationId: string
  defaultPrivacyLevel: DefaultPrivacyLevel
  replaySampleRate: number
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

  if (initConfiguration.replaySampleRate !== undefined && !isPercentage(initConfiguration.replaySampleRate)) {
    display.error('Replay Sample Rate should be a number between 0 and 100')
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
      replaySampleRate: initConfiguration.replaySampleRate ?? 0,
      allowedTracingOrigins: initConfiguration.allowedTracingOrigins ?? [],
      tracingSampleRate: initConfiguration.tracingSampleRate,
      excludedActivityUrls: initConfiguration.excludedActivityUrls ?? [],
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
