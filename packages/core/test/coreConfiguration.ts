import type { InitConfiguration } from '../src/domain/configuration'
import type { RawTelemetryConfiguration } from '../src/domain/telemetry'
import type { CamelToSnakeCase, RemoveIndex } from './typeUtils'

// Defines a few constants and types related to the core package configuration, so it can be used in
// other packages tests.

/**
 * An object containing every single possible configuration initialization parameters, with
 * arbitrary values.
 */
export const EXHAUSTIVE_INIT_CONFIGURATION: Required<InitConfiguration> = {
  clientToken: 'yes',
  beforeSend: () => true,
  sessionSampleRate: 50,
  telemetrySampleRate: 60,
  silentMultipleInit: true,
  allowFallbackToLocalStorage: true,
  allowUntrustedEvents: true,
  storeContextsAcrossPages: true,
  trackingConsent: 'not-granted',
  proxy: 'proxy',
  site: 'datadoghq.com',
  service: 'service',
  env: 'env',
  version: 'version',
  usePartitionedCrossSiteSessionCookie: true,
  useSecureSessionCookie: true,
  trackAnonymousUser: true,
  trackSessionAcrossSubdomains: true,
  enableExperimentalFeatures: ['foo'],
  replica: {
    clientToken: 'yes',
  },
  datacenter: 'datacenter',
  internalAnalyticsSubdomain: 'internal-analytics-subdomain.com',
  telemetryConfigurationSampleRate: 70,
  telemetryUsageSampleRate: 80,
}

export const SERIALIZED_EXHAUSTIVE_INIT_CONFIGURATION = {
  session_sample_rate: 50,
  telemetry_sample_rate: 60,
  telemetry_configuration_sample_rate: 70,
  telemetry_usage_sample_rate: 80,
  use_before_send: true,
  use_partitioned_cross_site_session_cookie: true,
  use_secure_session_cookie: true,
  use_proxy: true,
  silent_multiple_init: true,
  track_session_across_subdomains: true,
  allow_fallback_to_local_storage: true,
  store_contexts_across_pages: true,
  allow_untrusted_events: true,
  tracking_consent: 'not-granted' as const,
  track_anonymous_user: true,
}

/**
 * Maps the keys of InitConfiguration to their serialized version.
 */
export type MapInitConfigurationKey<Key extends string> =
  // Some keys are prefixed with `use_` to indicate that they are boolean flags
  Key extends 'proxy' | 'beforeSend'
    ? `use_${CamelToSnakeCase<Key>}`
    : // Those keys should not be serialized
      Key extends
          | 'site'
          | 'service'
          | 'clientToken'
          | 'env'
          | 'version'
          | 'datacenter'
          | 'internalAnalyticsSubdomain'
          | 'replica'
          | 'enableExperimentalFeatures'
      ? never
      : // Other keys are simply snake cased
        CamelToSnakeCase<Key>

/**
 * Extracts a sub-set of RawTelemetryConfiguration from the passed InitConfiguration keys, with all
 * properties required, to make sure they are all defined.
 *
 * This type is only used in tests because "template literal types" were introduced in (TS 4.1)[1] and we
 * still support TS 3.8.2.
 *
 * [1]: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-1.html#template-literal-types
 *
 * @example
 * type SerializedInitConfiguration = ExtractTelemetryConfiguration<
 *   "session_sample_rate" | "track_user_interactions"
 * >
 * // equivalent to:
 * // type SerializedInitConfiguration = {
 * //   session_sample_rate: number | undefined;
 * //   track_user_interactions: boolean | undefined;
 * // }
 */
export type ExtractTelemetryConfiguration<Keys extends keyof RemoveIndex<RawTelemetryConfiguration>> = {
  [Key in Keys]: RawTelemetryConfiguration[Key]
}
