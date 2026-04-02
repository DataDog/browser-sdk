import type { DEFAULTS } from './defaults'

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
  /** Service name tag forwarded with every event. */
  service?: string
  /**
   * Percentage of sessions to track, between `0` and `100`.
   *
   * @default 100
   */
  sessionSampleRate?: number
  /** Datadog site to send data to (e.g. `datadoghq.com`, `datadoghq.eu`). */
  site: string
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

export type { InitConfiguration, Configuration, Extension }
export { build } from './build'
export { DEFAULTS } from './defaults'
export { validate } from './validation'
