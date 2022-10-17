import type { CookieOptions } from '../../browser/cookie'
import { getCurrentSite } from '../../browser/cookie'
import { catchUserErrors } from '../../tools/catchUserErrors'
import { display } from '../../tools/display'
import { assign, isPercentage, ONE_KIBI_BYTE, ONE_SECOND } from '../../tools/utils'
import type { RawTelemetryConfiguration } from '../telemetry'
import { updateExperimentalFeatures } from './experimentalFeatures'
import { initSimulation } from './simulation'
import type { TransportConfiguration } from './transportConfiguration'
import { computeTransportConfiguration } from './transportConfiguration'

export const DefaultPrivacyLevel = {
  ALLOW: 'allow',
  MASK: 'mask',
  MASK_USER_INPUT: 'mask-user-input',
} as const
export type DefaultPrivacyLevel = typeof DefaultPrivacyLevel[keyof typeof DefaultPrivacyLevel]

export interface InitConfiguration {
  // global options
  clientToken: string
  beforeSend?: GenericBeforeSendCallback | undefined
  sampleRate?: number | undefined
  telemetrySampleRate?: number | undefined
  silentMultipleInit?: boolean | undefined

  // transport options
  proxyUrl?: string | undefined
  site?: string | undefined

  // tag and context options
  service?: string | undefined
  env?: string | undefined
  version?: string | undefined

  // cookie options
  useCrossSiteSessionCookie?: boolean | undefined
  useSecureSessionCookie?: boolean | undefined
  trackSessionAcrossSubdomains?: boolean | undefined

  // internal options
  enableExperimentalFeatures?: string[] | undefined
  replica?: ReplicaUserConfiguration | undefined
  datacenter?: string
  telemetryConfigurationSampleRate?: number

  // simulation options
  simulationStart?: string | undefined
  simulationEnd?: string | undefined
  simulationLabel?: string | undefined
}

// This type is only used to build the core configuration. Logs and RUM SDKs are using a proper type
// for this option.
type GenericBeforeSendCallback = (event: any, context?: any) => unknown

interface ReplicaUserConfiguration {
  applicationId?: string
  clientToken: string
}

export interface Configuration extends TransportConfiguration {
  // Built from init configuration
  beforeSend: GenericBeforeSendCallback | undefined
  cookieOptions: CookieOptions
  sampleRate: number
  telemetrySampleRate: number
  telemetryConfigurationSampleRate: number
  service: string | undefined
  silentMultipleInit: boolean

  // Event limits
  eventRateLimiterThreshold: number // Limit the maximum number of actions, errors and logs per minutes
  maxTelemetryEventsPerPage: number

  // Batch configuration
  batchBytesLimit: number
  flushTimeout: number
  batchMessagesLimit: number
  messageBytesLimit: number
}

export function validateAndBuildConfiguration(initConfiguration: InitConfiguration): Configuration | undefined {
  if (!initConfiguration || !initConfiguration.clientToken) {
    display.error('Client Token is not configured, we will not send any data.')
    return
  }

  if (initConfiguration.sampleRate !== undefined && !isPercentage(initConfiguration.sampleRate)) {
    display.error('Sample Rate should be a number between 0 and 100')
    return
  }

  if (initConfiguration.telemetrySampleRate !== undefined && !isPercentage(initConfiguration.telemetrySampleRate)) {
    display.error('Telemetry Sample Rate should be a number between 0 and 100')
    return
  }

  if (
    initConfiguration.telemetryConfigurationSampleRate !== undefined &&
    !isPercentage(initConfiguration.telemetryConfigurationSampleRate)
  ) {
    display.error('Telemetry Configuration Sample Rate should be a number between 0 and 100')
    return
  }

  // Set the experimental feature flags as early as possible, so we can use them in most places
  updateExperimentalFeatures(initConfiguration.enableExperimentalFeatures)

  initSimulation(initConfiguration.simulationStart, initConfiguration.simulationEnd, initConfiguration.simulationLabel)

  return assign(
    {
      beforeSend:
        initConfiguration.beforeSend && catchUserErrors(initConfiguration.beforeSend, 'beforeSend threw an error:'),
      cookieOptions: buildCookieOptions(initConfiguration),
      sampleRate: initConfiguration.sampleRate ?? 100,
      telemetrySampleRate: initConfiguration.telemetrySampleRate ?? 20,
      telemetryConfigurationSampleRate: initConfiguration.telemetryConfigurationSampleRate ?? 5,
      service: initConfiguration.service,
      silentMultipleInit: !!initConfiguration.silentMultipleInit,

      /**
       * beacon payload max queue size implementation is 64kb
       * ensure that we leave room for logs, rum and potential other users
       */
      batchBytesLimit: 16 * ONE_KIBI_BYTE,

      eventRateLimiterThreshold: 3000,
      maxTelemetryEventsPerPage: 15,

      /**
       * flush automatically, aim to be lower than ALB connection timeout
       * to maximize connection reuse.
       */
      flushTimeout: 30 * ONE_SECOND,

      /**
       * Logs intake limit
       */
      batchMessagesLimit: 50,
      messageBytesLimit: 256 * ONE_KIBI_BYTE,
    },
    computeTransportConfiguration(initConfiguration)
  )
}

export function buildCookieOptions(initConfiguration: InitConfiguration) {
  const cookieOptions: CookieOptions = {}

  cookieOptions.secure = mustUseSecureCookie(initConfiguration)
  cookieOptions.crossSite = !!initConfiguration.useCrossSiteSessionCookie

  if (initConfiguration.trackSessionAcrossSubdomains) {
    cookieOptions.domain = getCurrentSite()
  }

  return cookieOptions
}

function mustUseSecureCookie(initConfiguration: InitConfiguration) {
  return !!initConfiguration.useSecureSessionCookie || !!initConfiguration.useCrossSiteSessionCookie
}

export function serializeConfiguration(configuration: InitConfiguration): Partial<RawTelemetryConfiguration> {
  return {
    session_sample_rate: configuration.sampleRate,
    telemetry_sample_rate: configuration.telemetrySampleRate,
    telemetry_configuration_sample_rate: configuration.telemetryConfigurationSampleRate,
    use_before_send: !!configuration.beforeSend,
    use_cross_site_session_cookie: configuration.useCrossSiteSessionCookie,
    use_secure_session_cookie: configuration.useSecureSessionCookie,
    use_proxy: configuration.proxyUrl !== undefined ? !!configuration.proxyUrl : undefined,
    silent_multiple_init: configuration.silentMultipleInit,
    track_session_across_subdomains: configuration.trackSessionAcrossSubdomains,
  }
}
