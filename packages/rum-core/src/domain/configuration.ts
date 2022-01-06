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
  // global options
  applicationId: string
  beforeSend?: ((event: RumEvent, context: RumEventDomainContext) => void | boolean) | undefined

  // tracing options
  allowedTracingOrigins?: ReadonlyArray<string | RegExp> | undefined

  // replay options
  defaultPrivacyLevel?: DefaultPrivacyLevel | undefined
  replaySampleRate?: number | undefined

  // action options
  trackInteractions?: boolean | undefined
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
  replaySampleRate: number
  trackInteractions: boolean
  trackViewsManually: boolean
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

  const baseConfiguration = validateAndBuildConfiguration(initConfiguration, buildEnv)
  if (!baseConfiguration) {
    return
  }

  return {
    ...baseConfiguration,

    applicationId: initConfiguration.applicationId,
    actionNameAttribute: initConfiguration.actionNameAttribute,
    replaySampleRate: initConfiguration.replaySampleRate ?? 100,
    allowedTracingOrigins: initConfiguration.allowedTracingOrigins ?? [],
    trackInteractions: !!initConfiguration.trackInteractions,
    trackViewsManually: !!initConfiguration.trackViewsManually,
    defaultPrivacyLevel: objectHasValue(DefaultPrivacyLevel, initConfiguration.defaultPrivacyLevel)
      ? initConfiguration.defaultPrivacyLevel
      : DefaultPrivacyLevel.MASK_USER_INPUT,
  }
}
