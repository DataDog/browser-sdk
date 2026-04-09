import type { DEFAULTS } from './defaults'

/**
 * Function that receives the intake request path and parameters and returns the final URL.
 * Used to route SDK requests through a custom proxy.
 */
type ProxyFn = (options: { path: string; parameters: string }) => string

/** Known Datadog sites. Accepts any string for custom deployments. */
type Site =
  | 'datadoghq.com'
  | 'us3.datadoghq.com'
  | 'us5.datadoghq.com'
  | 'datadoghq.eu'
  | 'ddog-gov.com'
  | 'ap1.datadoghq.com'
  | 'ap2.datadoghq.com'
  | (string & {})

const SessionPersistence = {
  COOKIE: 'cookie',
  LOCAL_STORAGE: 'local-storage',
  MEMORY: 'memory',
} as const

type SessionPersistence = (typeof SessionPersistence)[keyof typeof SessionPersistence]

/** Configuration for dual-shipping events to a replica Datadog org. */
interface ReplicaConfiguration {
  /** Client token of the replica org. */
  clientToken: string
  /** Application ID for RUM events in the replica org. */
  applicationId?: string
}

interface InitConfiguration {
  /** Client token for authenticating requests to the Datadog intake API. */
  clientToken: string
  /**
   * Whether the SDK is active and collecting data.
   *
   * @default true
   */
  enabled?: boolean
  /** Application environment tag (e.g. `production`, `staging`). */
  env?: string
  /**
   * Route SDK requests through a proxy. Can be a URL string or a function
   * that receives `{ path, parameters }` and returns the final URL.
   *
   * When set as a string, the SDK appends the intake path and query parameters.
   * When set as a function, the SDK delegates URL construction entirely.
   */
  proxy?: string | ProxyFn
  /**
   * Dual-ship events to a replica Datadog org for disaster recovery.
   * The replica always targets `datadoghq.com` (US1).
   */
  replica?: ReplicaConfiguration
  /** Service name tag forwarded with every event. */
  service?: string
  /**
   * Percentage of sessions to track, between `0` and `100`.
   *
   * @default 100
   */
  sessionSampleRate?: number
  /** Datadog site to send data to (e.g. `datadoghq.com`, `datadoghq.eu`). */
  site: Site
  /**
   * SDK source identifier. Overrides the `ddsource` query parameter.
   *
   * @default 'browser'
   */
  source?: 'browser' | 'flutter' | 'unity'
  /**
   * Percentage of configuration telemetry events to forward, between `0` and `100`.
   *
   * @default 5
   */
  telemetryConfigurationSampleRate?: number
  /**
   * Percentage of internal telemetry events to forward, between `0` and `100`.
   *
   * @default 20
   */
  telemetrySampleRate?: number
  /**
   * Percentage of usage telemetry events to forward, between `0` and `100`.
   *
   * @default 5
   */
  telemetryUsageSampleRate?: number
  /**
   * Automatically set `usr.anonymous_id` from the session's device ID.
   *
   * @default true
   */
  trackAnonymousUser?: boolean
  /**
   * Track sessions across subdomains of the same site by setting
   * the cookie domain to the root domain.
   *
   * @default false
   */
  trackSessionAcrossSubdomains?: boolean
  /**
   * Which storage strategy to use for persisting sessions. Can be `'cookie'`, `'local-storage'`,
   * or `'memory'`. When an array is provided, the SDK attempts each in order.
   *
   * @default 'cookie'
   */
  sessionPersistence?: SessionPersistence | SessionPersistence[]
  /**
   * Persist global context, user context, and account context across page loads
   * using the selected session storage.
   *
   * @default false
   */
  storeContextsAcrossPages?: boolean
  /**
   * Use the `Secure` flag on the session cookie. Required for HTTPS-only sites.
   *
   * @default false
   */
  useSecureSessionCookie?: boolean
  /**
   * Use the `Partitioned` attribute on the session cookie for cross-site contexts.
   *
   * @default false
   */
  usePartitionedCrossSiteSessionCookie?: boolean
  /**
   * Use the PCI-compliant intake endpoint for logs. US1 only.
   *
   * @default false
   */
  usePciIntake?: boolean
  /**
   * Override the SDK version reported in `ddtags` and `_dd.browser_sdk_version`.
   * Normally set at build time.
   */
  sdkVersion?: string
  /**
   * Suppress errors when `init` is called more than once.
   *
   * @default false
   */
  silentMultipleInit?: boolean
  /** Application version tag forwarded with every event. */
  version?: string
}

/**
 * Resolved configuration produced by {@link build}.
 * Fields with defaults in {@link DEFAULTS} are required, the rest stays as declared in {@link InitConfiguration}.
 */
type DefaultKeys = keyof typeof DEFAULTS & keyof InitConfiguration
type Configuration = Required<Pick<InitConfiguration, DefaultKeys>> & Omit<InitConfiguration, DefaultKeys>

interface Extension<TKey extends string, TInit, TConfig, TDerived = object> {
  build?(config: TConfig): TDerived
  key: TKey
  validate(init: TInit | undefined): TConfig | null
}

export type { InitConfiguration, Configuration, Extension, ProxyFn, Site, ReplicaConfiguration }
export { SessionPersistence }
export { build } from './build'
export { DEFAULTS } from './defaults'
export { validate } from './validation'
