import { catchUserErrors } from '../../tools/catchUserErrors'
import { DOCS_ORIGIN, display } from '../../tools/display'
import type { RawTelemetryConfiguration } from '../telemetry'
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
  /**
   * The client token for Datadog. Required for authenticating your application with Datadog.
   */
  clientToken: string
  beforeSend?: GenericBeforeSendCallback | undefined
  /**
   * The percentage of sessions tracked. A value between 0 and 100.
   * @default 100
   */
  sessionSampleRate?: number | undefined
  /**
   * The percentage of telemetry events sent. A value between 0 and 100.
   * @default 20
   */
  telemetrySampleRate?: number | undefined
  /**
   * Initialization fails silently if the RUM Browser SDK is already initialized on the page.
   * @default false
   */
  silentMultipleInit?: boolean | undefined
  /**
   * Allows the use of localStorage when cookies cannot be set. This enables the RUM Browser SDK to run in environments that do not provide cookie support.
   * See [Monitor Electron Applications Using the Browser SDK](https://docs.datadoghq.com/real_user_monitoring/guide/monitor-electron-applications-using-browser-sdk) for further information.
   * @default false
   */
  allowFallbackToLocalStorage?: boolean | undefined
  /**
   * Allow listening to DOM events dispatched programmatically ([untrusted events](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted)). Enabling this option can be useful if you heavily rely on programmatic events, such as in an automated UI test environment.
   * @default false
   */
  allowUntrustedEvents?: boolean | undefined
  /**
   * Store global context and user context in localStorage to preserve them along the user navigation.
   * See [Contexts life cycle](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/?tab=npm#contexts-life-cycle) for further information.
   * @default false
   */
  storeContextsAcrossPages?: boolean | undefined
  /**
   * Set the initial user tracking consent state.
   * See [User tracking consent](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/?tab=npm#user-tracking-consent) for further information.
   * @default granted
   */
  trackingConsent?: TrackingConsent | undefined

  // transport options
  /**
   * Optional proxy URL, for example: https://www.proxy.com/path.
   * See [Proxy Your Browser RUM Data](https://docs.datadoghq.com/real_user_monitoring/guide/proxy-rum-data) for further information.
   */
  proxy?: string | ProxyFn | undefined
  /**
   * The Datadog [site](https://docs.datadoghq.com/getting_started/site) parameter of your organization.
   * @default datadoghq.com
   */
  site?: string | undefined

  // tag and context options
  /**
   * The service name for your application. Follows the [tag syntax requirements](https://docs.datadoghq.com/getting_started/tagging/#define-tags).
   */
  service?: string | undefined | null
  /**
   * The application’s environment, for example: prod, pre-prod, and staging. Follows the [tag syntax requirements](https://docs.datadoghq.com/getting_started/tagging/#define-tags).
   */
  env?: string | undefined | null
  /**
   * The application’s version, for example: 1.2.3, 6c44da20, and 2020.02.13. Follows the [tag syntax requirements](https://docs.datadoghq.com/getting_started/tagging/#define-tags).
   */
  version?: string | undefined | null

  // cookie options
  /**
   * Whether a secure cross-site session cookie is used
   * @default false
   * @deprecated use usePartitionedCrossSiteSessionCookie instead
   */
  useCrossSiteSessionCookie?: boolean | undefined
  /**
   * Use a partitioned secure cross-site session cookie. This allows the RUM Browser SDK to run when the site is loaded from another one (iframe). Implies `useSecureSessionCookie`.
   * @default false
   */
  usePartitionedCrossSiteSessionCookie?: boolean | undefined
  /**
   * Use a secure session cookie. This disables RUM events sent on insecure (non-HTTPS) connections.
   * @default false
   */
  useSecureSessionCookie?: boolean | undefined
  /**
   * Preserve the session across subdomains for the same site.
   * @default false
   */
  trackSessionAcrossSubdomains?: boolean | undefined

  // internal options
  /**
   * [Internal option] Enable experimental features
   */
  enableExperimentalFeatures?: string[] | undefined
  /**
   * [Internal option] Configure the dual chipping to another datacenter
   */
  replica?: ReplicaUserConfiguration | undefined
  /**
   * [Internal option] Set the datacenter from where the data is dual chipped
   */
  datacenter?: string
  /**
   * [Internal option] Datadog internal analytics subdomain
   */
  // TODO next major: remove this option and replace usages by proxyFn
  internalAnalyticsSubdomain?: string
  /**
   * [Internal option] The percentage of telemetry configuration sent. A value between 0 and 100.
   * @default 5
   */
  telemetryConfigurationSampleRate?: number
  /**
   * [Internal option] The percentage of telemetry usage sent. A value between 0 and 100.
   * @default 5
   */
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
  storeContextsAcrossPages: boolean

  // Event limits
  eventRateLimiterThreshold: number // Limit the maximum number of actions, errors and logs per minutes
  maxTelemetryEventsPerPage: number

  // Batch configuration
  batchBytesLimit: number
  flushTimeout: Duration
  batchMessagesLimit: number
  messageBytesLimit: number
}

function checkIfString(tag: unknown, tagName: string): tag is string | undefined | null {
  if (tag !== undefined && tag !== null && typeof tag !== 'string') {
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
    display.error(`Site should be a valid Datadog site. Learn more here: ${DOCS_ORIGIN}/getting_started/site/.`)
    return
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
      service: initConfiguration.service || undefined,
      silentMultipleInit: !!initConfiguration.silentMultipleInit,
      allowUntrustedEvents: !!initConfiguration.allowUntrustedEvents,
      trackingConsent: initConfiguration.trackingConsent ?? TrackingConsent.GRANTED,
      storeContextsAcrossPages: !!initConfiguration.storeContextsAcrossPages,
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
    use_before_send: !!initConfiguration.beforeSend,
    use_cross_site_session_cookie: initConfiguration.useCrossSiteSessionCookie,
    use_partitioned_cross_site_session_cookie: initConfiguration.usePartitionedCrossSiteSessionCookie,
    use_secure_session_cookie: initConfiguration.useSecureSessionCookie,
    use_proxy: !!initConfiguration.proxy,
    silent_multiple_init: initConfiguration.silentMultipleInit,
    track_session_across_subdomains: initConfiguration.trackSessionAcrossSubdomains,
    allow_fallback_to_local_storage: !!initConfiguration.allowFallbackToLocalStorage,
    store_contexts_across_pages: !!initConfiguration.storeContextsAcrossPages,
    allow_untrusted_events: !!initConfiguration.allowUntrustedEvents,
    tracking_consent: initConfiguration.trackingConsent,
  } satisfies RawTelemetryConfiguration
}
