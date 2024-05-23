import { catchUserErrors } from '../../tools/catchUserErrors'
import { display } from '../../tools/display'
import type { RawTelemetryConfiguration } from '../telemetry'
import { ExperimentalFeature, addExperimentalFeatures } from '../../tools/experimentalFeatures'
import type { Duration } from '../../tools/utils/timeUtils'
import { ONE_SECOND } from '../../tools/utils/timeUtils'
import { isPercentage } from '../../tools/utils/numberUtils'
import { ONE_KIBI_BYTE } from '../../tools/utils/byteUtils'
import { objectHasValue } from '../../tools/utils/objectUtils'
import { assign } from '../../tools/utils/polyfills'
import { selectSessionStoreStrategyType } from '../session/sessionStore'
import type { SessionStoreStrategyType } from '../session/storeStrategies/sessionStoreStrategy'
import { TrackingConsent } from '../trackingConsent'
import type { TransportConfiguration } from './transportConfiguration'
import { computeTransportConfiguration } from './transportConfiguration'

export const DOC_LINK = 'https://docs.datadoghq.com/getting_started/site/'
export const DefaultPrivacyLevel = {
  ALLOW: 'allow',
  MASK: 'mask',
  MASK_USER_INPUT: 'mask-user-input',
} as const
export type DefaultPrivacyLevel = (typeof DefaultPrivacyLevel)[keyof typeof DefaultPrivacyLevel]

export const TraceContextInjection = {
  ALL: 'all',
  SAMPLED: 'sampled',
} as const

export type TraceContextInjection = (typeof TraceContextInjection)[keyof typeof TraceContextInjection]

export interface InitConfiguration {
  // global options
  clientToken: string
  beforeSend?: GenericBeforeSendCallback | undefined
  sessionSampleRate?: number | undefined
  telemetrySampleRate?: number | undefined
  silentMultipleInit?: boolean | undefined
  allowFallbackToLocalStorage?: boolean | undefined
  allowUntrustedEvents?: boolean | undefined
  storeContextsAcrossPages?: boolean | undefined
  trackingConsent?: TrackingConsent | undefined

  // transport options
  proxy?: string | ProxyFn | undefined
  site?: string | undefined

  // tag and context options
  service?: string | undefined
  env?: string | undefined
  version?: string | undefined

  // cookie options
  /**
   * @deprecated use usePartitionedCrossSiteSessionCookie instead
   */
  useCrossSiteSessionCookie?: boolean | undefined
  usePartitionedCrossSiteSessionCookie?: boolean | undefined
  useSecureSessionCookie?: boolean | undefined
  trackSessionAcrossSubdomains?: boolean | undefined

  // internal options
  enableExperimentalFeatures?: string[] | undefined
  replica?: ReplicaUserConfiguration | undefined
  datacenter?: string
  // TODO next major: remove this option and replace usages by proxyFn
  internalAnalyticsSubdomain?: string

  telemetryConfigurationSampleRate?: number
  telemetryUsageSampleRate?: number
}

// This type is only used to build the core configuration. Logs and RUM SDKs are using a proper type
// for this option.
type GenericBeforeSendCallback = (event: any, context?: any) => unknown

/**
 * path: /api/vX/product
 * parameters: xxx=yyy&zzz=aaa
 */
type ProxyFn = (options: { path: string; parameters: string }) => string

interface ReplicaUserConfiguration {
  applicationId?: string
  clientToken: string
}

export interface Configuration extends TransportConfiguration {
  // Built from init configuration
  beforeSend: GenericBeforeSendCallback | undefined
  sessionStoreStrategyType: SessionStoreStrategyType | undefined
  sessionSampleRate: number
  telemetrySampleRate: number
  telemetryConfigurationSampleRate: number
  telemetryUsageSampleRate: number
  service: string | undefined
  silentMultipleInit: boolean
  allowUntrustedEvents: boolean
  trackingConsent: TrackingConsent

  // Event limits
  eventRateLimiterThreshold: number // Limit the maximum number of actions, errors and logs per minutes
  maxTelemetryEventsPerPage: number

  // Batch configuration
  batchBytesLimit: number
  flushTimeout: Duration
  batchMessagesLimit: number
  messageBytesLimit: number
}

function checkIfString(tag: unknown, tagName: string) {
  if (tag !== undefined && typeof tag !== 'string') {
    display.error(`${tagName} must be defined as a string`)
    return false
  }
  return true
}

function isDatadogSite(site: string) {
  return /(datadog|ddog|datad0g|dd0g)/.test(site)
}

export function validateAndBuildConfiguration(initConfiguration: InitConfiguration): Configuration | undefined {
  if (!initConfiguration || !initConfiguration.clientToken) {
    display.error('Client Token is not configured, we will not send any data.')
    return
  }

  if (initConfiguration.sessionSampleRate !== undefined && !isPercentage(initConfiguration.sessionSampleRate)) {
    display.error('Session Sample Rate should be a number between 0 and 100')
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

  if (
    initConfiguration.telemetryUsageSampleRate !== undefined &&
    !isPercentage(initConfiguration.telemetryUsageSampleRate)
  ) {
    display.error('Telemetry Usage Sample Rate should be a number between 0 and 100')
    return
  }

  if (!checkIfString(initConfiguration.version, 'Version')) {
    return
  }

  if (!checkIfString(initConfiguration.env, 'Env')) {
    return
  }

  if (!checkIfString(initConfiguration.service, 'Service')) {
    return
  }

  if (
    initConfiguration.trackingConsent !== undefined &&
    !objectHasValue(TrackingConsent, initConfiguration.trackingConsent)
  ) {
    display.error('Tracking Consent should be either "granted" or "not-granted"')
    return
  }

  if (initConfiguration.site && !isDatadogSite(initConfiguration.site)) {
    display.error(`Site should be a valid Datadog site. Learn more here: ${DOC_LINK}.`)
    return
  }

  // Set the experimental feature flags as early as possible, so we can use them in most places
  if (Array.isArray(initConfiguration.enableExperimentalFeatures)) {
    addExperimentalFeatures(
      initConfiguration.enableExperimentalFeatures.filter((flag): flag is ExperimentalFeature =>
        objectHasValue(ExperimentalFeature, flag)
      )
    )
  }

  return assign(
    {
      beforeSend:
        initConfiguration.beforeSend && catchUserErrors(initConfiguration.beforeSend, 'beforeSend threw an error:'),
      sessionStoreStrategyType: selectSessionStoreStrategyType(initConfiguration),
      sessionSampleRate: initConfiguration.sessionSampleRate ?? 100,
      telemetrySampleRate: initConfiguration.telemetrySampleRate ?? 20,
      telemetryConfigurationSampleRate: initConfiguration.telemetryConfigurationSampleRate ?? 5,
      telemetryUsageSampleRate: initConfiguration.telemetryUsageSampleRate ?? 5,
      service: initConfiguration.service,
      silentMultipleInit: !!initConfiguration.silentMultipleInit,
      allowUntrustedEvents: !!initConfiguration.allowUntrustedEvents,
      trackingConsent: initConfiguration.trackingConsent ?? TrackingConsent.GRANTED,

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
      flushTimeout: (30 * ONE_SECOND) as Duration,

      /**
       * Logs intake limit
       */
      batchMessagesLimit: 50,
      messageBytesLimit: 256 * ONE_KIBI_BYTE,
    },
    computeTransportConfiguration(initConfiguration)
  )
}

export function serializeConfiguration(initConfiguration: InitConfiguration) {
  return {
    session_sample_rate: initConfiguration.sessionSampleRate,
    telemetry_sample_rate: initConfiguration.telemetrySampleRate,
    telemetry_configuration_sample_rate: initConfiguration.telemetryConfigurationSampleRate,
    telemetry_usage_sample_rate: initConfiguration.telemetryUsageSampleRate,
    tracking_consent: initConfiguration.trackingConsent,
    use_proxy: !!initConfiguration.proxy,
    use_before_send: !!initConfiguration.beforeSend,
    silent_multiple_init: initConfiguration.silentMultipleInit,
    track_session_across_subdomains: initConfiguration.trackSessionAcrossSubdomains,
    use_cross_site_session_cookie: initConfiguration.useCrossSiteSessionCookie,
    use_partitioned_cross_site_session_cookie: initConfiguration.usePartitionedCrossSiteSessionCookie,
    use_secure_session_cookie: initConfiguration.useSecureSessionCookie,
    allow_fallback_to_local_storage: !!initConfiguration.allowFallbackToLocalStorage,
    store_contexts_across_pages: !!initConfiguration.storeContextsAcrossPages,
    allow_untrusted_events: !!initConfiguration.allowUntrustedEvents,
  } satisfies RawTelemetryConfiguration
}
