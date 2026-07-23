import type { ProxyFn, Site } from '@datadog/js-core/transport'
import { INTAKE_SITE_US1 } from '@datadog/js-core/transport'
import type { InferredConfig, MatchOption } from '@datadog/js-core/configuration'
import type { RawTelemetryConfiguration } from '../telemetry'
import { TrackingConsent } from '../trackingConsent'
import type { SessionPersistence } from '../session/sessionConstants'

/**
 * Default privacy level for the browser SDK.
 *
 * [Replay Privacy Options](https://docs.datadoghq.com/real_user_monitoring/session_replay/browser/privacy_options) for further information.
 */
export const DefaultPrivacyLevel = {
  ALLOW: 'allow',
  MASK: 'mask',
  MASK_USER_INPUT: 'mask-user-input',
  MASK_UNLESS_ALLOWLISTED: 'mask-unless-allowlisted',
} as const
export type DefaultPrivacyLevel = (typeof DefaultPrivacyLevel)[keyof typeof DefaultPrivacyLevel]

/**
 * Trace context injection option.
 *
 * See [Connect RUM and Traces](https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum) for further information.
 */
export const TraceContextInjection = {
  ALL: 'all',
  SAMPLED: 'sampled',
} as const

/**
 * Trace context injection option.
 *
 * See [Connect RUM and Traces](https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum) for further information.
 *
 */
export type TraceContextInjection = (typeof TraceContextInjection)[keyof typeof TraceContextInjection]

export interface InitConfiguration {
  /**
   * The client token for Datadog. Required for authenticating your application with Datadog.
   *
   * @category Authentication
   */
  clientToken: string

  /**
   * A callback function that can be used to modify events before they are sent to Datadog.
   *
   * @category Data Collection
   */
  beforeSend?: GenericBeforeSendCallback | undefined

  /**
   * The percentage of sessions tracked. A value between 0 and 100.
   *
   * @category Data Collection
   * @defaultValue 100
   */
  sessionSampleRate?: number | undefined

  /**
   * The percentage of telemetry events sent. A value between 0 and 100.
   *
   * @category Data Collection
   * @defaultValue 20
   */
  telemetrySampleRate?: number | undefined

  /**
   * Initialization fails silently if the RUM Browser SDK is already initialized on the page.
   *
   * @defaultValue false
   */
  silentMultipleInit?: boolean | undefined

  /**
   * Which storage strategy to use for persisting sessions. Can be 'cookie', 'local-storage', or 'memory'.
   * When an array is provided, the SDK will attempt each persistence type in the order specified.
   *
   * Important: If you are using the RUM and Logs Browser SDKs, this option must be configured with identical values
   *
   * Note: 'memory' option is only for use with single-page applications. All page loads will start a new session, likely resulting in an increase in total number of RUM sessions
   *
   * @category Session Persistence
   * @defaultValue "cookie"
   */
  sessionPersistence?: SessionPersistence | SessionPersistence[] | undefined

  /**
   * Allow listening to DOM events dispatched programmatically ([untrusted events](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted)). Enabling this option can be useful if you heavily rely on programmatic events, such as in an automated UI test environment.
   *
   * @defaultValue false
   */
  allowUntrustedEvents?: boolean | undefined

  /**
   * Store global context and user context in localStorage to preserve them along the user navigation.
   * See [Contexts life cycle](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/?tab=npm#contexts-life-cycle) for further information.
   *
   * @defaultValue false
   */
  storeContextsAcrossPages?: boolean | undefined

  /**
   * Set the initial user tracking consent state.
   * See [User tracking consent](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/?tab=npm#user-tracking-consent) for further information.
   *
   * @category Privacy
   * @defaultValue granted
   */
  trackingConsent?: TrackingConsent | undefined

  /**
   * List of origins where the SDK is allowed to run when used in a browser extension context.
   * Matches urls against the extensions origin.
   * If not provided and the SDK is running in a browser extension, the SDK will not run.
   */
  allowedTrackingOrigins?: MatchOption[] | undefined

  // transport options
  /**
   * Optional proxy URL, for example: https://www.proxy.com/path.
   * See [Proxy Your Browser RUM Data](https://docs.datadoghq.com/real_user_monitoring/guide/proxy-rum-data) for further information.
   *
   * @category Transport
   */
  proxy?: string | ProxyFn | undefined

  /**
   * The Datadog [site](https://docs.datadoghq.com/getting_started/site) parameter of your organization.
   *
   * @category Transport
   * @defaultValue datadoghq.com
   */
  site?: Site | undefined

  // tag and context options
  /**
   * The service name for your application. Follows the [tag syntax requirements](https://docs.datadoghq.com/getting_started/tagging/#define-tags).
   *
   * @category Data Collection
   */
  service?: string | undefined | null

  /**
   * The application’s environment, for example: prod, pre-prod, and staging. Follows the [tag syntax requirements](https://docs.datadoghq.com/getting_started/tagging/#define-tags).
   *
   * @category Data Collection
   */
  env?: string | undefined | null

  /**
   * The application’s version, for example: 1.2.3, 6c44da20, and 2020.02.13. Follows the [tag syntax requirements](https://docs.datadoghq.com/getting_started/tagging/#define-tags).
   *
   * @category Data Collection
   */
  version?: string | undefined | null

  // cookie options
  /**
   * Use a partitioned secure cross-site session cookie. This allows the RUM Browser SDK to run when the site is loaded from another one (iframe). Implies `useSecureSessionCookie`.
   *
   * Important: If you are using the RUM and Logs Browser SDKs, this option must be configured with identical values
   *
   * @category Session Persistence
   * @defaultValue false
   */
  usePartitionedCrossSiteSessionCookie?: boolean | undefined

  /**
   * Use a secure session cookie. This disables RUM events sent on insecure (non-HTTPS) connections.
   *
   * Important: If you are using the RUM and Logs Browser SDKs, this option must be configured with identical values
   *
   * @category Session Persistence
   * @defaultValue false
   */
  useSecureSessionCookie?: boolean | undefined

  /**
   * Preserve the session across subdomains for the same site.
   *
   * Important: If you are using the RUM and Logs Browser SDKs, this option must be configured with identical values
   *
   * @category Session Persistence
   * @defaultValue false
   */
  trackSessionAcrossSubdomains?: boolean | undefined

  /**
   * Track anonymous user for the same site and extend cookie expiration date
   *
   * @category Data Collection
   * @defaultValue true
   */
  trackAnonymousUser?: boolean | undefined

  // internal options
  /**
   * [Internal option] Enable experimental features
   *
   * @internal
   */
  enableExperimentalFeatures?: string[] | undefined

  /**
   * [Internal option] Configure the dual shipping to another datacenter
   *
   * @internal
   */
  replica?: ReplicaInitConfiguration | undefined

  /**
   * [Internal option] Set the datacenter from where the data is dual shipped
   *
   * @internal
   */
  datacenter?: string

  /**
   * [Internal option] The percentage of telemetry configuration sent. A value between 0 and 100.
   *
   * @internal
   * @defaultValue 5
   */
  telemetryConfigurationSampleRate?: number

  /**
   * [Internal option] The percentage of telemetry usage sent. A value between 0 and 100.
   *
   * @internal
   * @defaultValue 5
   */
  telemetryUsageSampleRate?: number

  /**
   * [Internal option] Additional configuration for the SDK.
   *
   * @internal
   */
  source?: 'browser' | 'flutter' | 'unity' | undefined

  /**
   * [Internal option] Additional configuration for the SDK.
   *
   * @internal
   */
  sdkVersion?: string | undefined

  /**
   * [Internal option] Additional configuration for the SDK.
   *
   * @internal
   */
  variant?: string | undefined
}

// This type is only used to build the core configuration. Logs and RUM SDKs are using a proper type
// for this option.
type GenericBeforeSendCallback = (event: any, context?: any) => unknown

/**
 * @internal
 */
export interface ReplicaInitConfiguration {
  applicationId?: string
  clientToken: string
}

export type SdkSource = 'browser' | 'flutter' | 'unity'

export const BROWSER_CORE_SCHEMA = {
  clientToken: { type: 'string', required: true },

  // Optional tag fields
  service: { type: 'string' },
  env: { type: 'string' },
  version: { type: 'string' },

  // Transport
  site: { type: 'site', default: INTAKE_SITE_US1 },
  proxy: {
    type: 'union',
    variants: [{ type: 'string' }, { type: 'function', signature: undefined as ProxyFn | undefined }],
  },

  // Sample rates
  sessionSampleRate: { type: 'percentage', default: 100 },
  telemetrySampleRate: { type: 'percentage', default: 20 },
  telemetryConfigurationSampleRate: { type: 'percentage', default: 5 },
  telemetryUsageSampleRate: { type: 'percentage', default: 5 },

  // Booleans
  silentMultipleInit: { type: 'boolean', default: false, strict: false },
  storeContextsAcrossPages: { type: 'boolean', default: false, strict: false },
  trackAnonymousUser: { type: 'boolean', default: true, strict: false },
  useSecureSessionCookie: { type: 'boolean', default: false, strict: false },
  usePartitionedCrossSiteSessionCookie: { type: 'boolean', default: false, strict: false },
  trackSessionAcrossSubdomains: { type: 'boolean', default: false, strict: false },

  // Cookie/extension origin validation
  allowedTrackingOrigins: { type: 'match-option', multiple: true },

  // Privacy
  trackingConsent: { type: 'enum', values: TrackingConsent, default: TrackingConsent.GRANTED },

  // Callbacks
  beforeSend: { type: 'function', signature: undefined as GenericBeforeSendCallback | undefined },

  // Passthroughs
  source: { type: 'enum', values: ['browser', 'flutter', 'unity'] as const, default: 'browser', strict: false },
  sessionPersistence: {
    type: 'enum',
    values: ['cookie', 'local-storage', 'memory'] as const,
    multiple: true,
    strict: false,
  },
  replica: {
    type: 'schema',
    schema: {
      clientToken: { type: 'string', required: true },
      applicationId: { type: 'string' },
    },
  },

  // Internal
  datacenter: { type: 'string' },
  sdkVersion: { type: 'string' },
  variant: { type: 'string' },
} as const

export type Configuration = InferredConfig<typeof BROWSER_CORE_SCHEMA>

export function serializeConfiguration(initConfiguration: InitConfiguration) {
  return {
    session_sample_rate: initConfiguration.sessionSampleRate,
    telemetry_sample_rate: initConfiguration.telemetrySampleRate,
    telemetry_configuration_sample_rate: initConfiguration.telemetryConfigurationSampleRate,
    telemetry_usage_sample_rate: initConfiguration.telemetryUsageSampleRate,
    use_before_send: !!initConfiguration.beforeSend,
    use_partitioned_cross_site_session_cookie: initConfiguration.usePartitionedCrossSiteSessionCookie,
    use_secure_session_cookie: initConfiguration.useSecureSessionCookie,
    use_proxy: !!initConfiguration.proxy,
    silent_multiple_init: initConfiguration.silentMultipleInit,
    track_session_across_subdomains: initConfiguration.trackSessionAcrossSubdomains,
    track_anonymous_user: initConfiguration.trackAnonymousUser,
    session_persistence: Array.isArray(initConfiguration.sessionPersistence)
      ? initConfiguration.sessionPersistence[0]
      : initConfiguration.sessionPersistence,
    store_contexts_across_pages: !!initConfiguration.storeContextsAcrossPages,
    allow_untrusted_events: !!initConfiguration.allowUntrustedEvents,
    tracking_consent: initConfiguration.trackingConsent,
    use_allowed_tracking_origins: Array.isArray(initConfiguration.allowedTrackingOrigins),
    source: initConfiguration.source,
    sdk_version: initConfiguration.sdkVersion,
    variant: initConfiguration.variant,
  } satisfies RawTelemetryConfiguration
}
