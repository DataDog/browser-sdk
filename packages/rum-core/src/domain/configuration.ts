import {
  Configuration,
  DefaultPrivacyLevel,
  display,
  InitConfiguration,
  isPercentage,
  objectHasValue,
  validateAndBuildConfiguration,
} from '@datadog/browser-core'
import { buildEnv } from '../boot/buildEnv'
import { RumEventDomainContext } from '../domainContext.types'
import { RumEvent } from '../rumEvent.types'

export interface RumInitConfiguration extends InitConfiguration {
  applicationId: string
  beforeSend?: ((event: RumEvent, context: RumEventDomainContext) => void | boolean) | undefined
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined
}

export type HybridInitConfiguration = Omit<RumInitConfiguration, 'applicationId' | 'clientToken'>

export const DEFAULT_RUM_CONFIGURATION = {
  maxActionsPerMinute: 3000,

  replaySampleRate: 100,
  allowedTracingOrigins: [] as Array<RegExp | string>,
  trackInteractions: false,
  trackViewsManually: false,
  defaultPrivacyLevel: DefaultPrivacyLevel.MASK_USER_INPUT as DefaultPrivacyLevel,
}

export type RumConfiguration = Configuration &
  typeof DEFAULT_RUM_CONFIGURATION & {
    applicationId: string

    actionNameAttribute: string | undefined
  }

export function validateAndBuildRumConfiguration(
  initConfiguration: RumInitConfiguration
): RumConfiguration | undefined {
  if (!initConfiguration.applicationId) {
    display.error('Application ID is not configured, no RUM data will be collected.')
    return
  }

  const baseConfiguration = validateAndBuildConfiguration(initConfiguration, buildEnv)
  if (!baseConfiguration) {
    return
  }

  const configuration: RumConfiguration = {
    ...baseConfiguration,
    ...DEFAULT_RUM_CONFIGURATION,
    applicationId: initConfiguration.applicationId,
    actionNameAttribute: initConfiguration.actionNameAttribute,
  }

  if (initConfiguration.replaySampleRate !== undefined) {
    if (!isPercentage(initConfiguration.replaySampleRate)) {
      display.error('Replay Sample Rate should be a number between 0 and 100')
      return
    }
    configuration.replaySampleRate = initConfiguration.replaySampleRate
  }

  if (initConfiguration.allowedTracingOrigins !== undefined) {
    if (!Array.isArray(initConfiguration.allowedTracingOrigins)) {
      display.error('Allowed Tracing Origins should be an array')
      return
    }
    if (initConfiguration.allowedTracingOrigins.length !== 0 && configuration.service === undefined) {
      display.error('Service need to be configured when tracing is enabled')
      return
    }
    configuration.allowedTracingOrigins = initConfiguration.allowedTracingOrigins
  }

  if (initConfiguration.trackInteractions !== undefined) {
    configuration.trackInteractions = !!initConfiguration.trackInteractions
  }

  if (initConfiguration.trackViewsManually !== undefined) {
    configuration.trackViewsManually = !!initConfiguration.trackViewsManually
  }

  if (objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel)) {
    configuration.defaultPrivacyLevel = initConfiguration.defaultPrivacyLevel
  }

  return configuration
}
