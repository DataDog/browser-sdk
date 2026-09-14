import { createEndpointBuilder } from '@datadog/js-core/transport'
import { clocksNow } from '@datadog/js-core/time'
import type { Context } from '../../tools/serialisation/context'
import { generateUUID } from '../../tools/utils/stringUtils'
import { noop } from '../../tools/utils/functionUtils'
import { createBatch } from '../../transport'
import type { Configuration } from '../configuration'
import { TrackingConsent } from '../trackingConsent'

/**
 * Feature Flags SDK lifecycle transitions.
 *
 * @internal
 */
export const FeatureFlagsTelemetryEventType = {
  SDK_INIT_STARTED: 'sdk_init_started',
  CONFIGURATION_RECEIVED: 'configuration_received',
  PROVIDER_READY: 'provider_ready',
  PROVIDER_ERROR: 'provider_error',
  FIRST_EVALUATION: 'first_evaluation',
  INIT_TIMEOUT: 'init_timeout',
  INIT_FAILED: 'init_failed',
} as const

/**
 * Fixed error codes reported with Feature Flags lifecycle transitions.
 *
 * @internal
 */
export const FeatureFlagsTelemetryErrorCode = {
  PRECOMPUTED_ASSIGNMENTS_FETCH_FAILED: 'precomputed_assignments_fetch_failed',
  INITIALIZATION_TIMEOUT: 'initialization_timeout',
  INITIALIZATION_FAILED: 'initialization_failed',
} as const

/**
 * Sources from which the Feature Flags SDK can receive configuration.
 *
 * @internal
 */
export const FeatureFlagsTelemetryConfigurationSource = {
  REMOTE: 'remote',
  CACHE: 'cache',
} as const

/**
 * Provider states reported by Feature Flags lifecycle transitions.
 *
 * @internal
 */
export const FeatureFlagsTelemetryProviderStatus = {
  READY: 'ready',
  STALE: 'stale',
  ERROR: 'error',
} as const

/**
 * A Feature Flags lifecycle transition before common SDK fields are added.
 *
 * @internal
 */
export type FeatureFlagsLifecycleEvent =
  | { eventType: typeof FeatureFlagsTelemetryEventType.SDK_INIT_STARTED }
  | {
      eventType: typeof FeatureFlagsTelemetryEventType.CONFIGURATION_RECEIVED
      configurationSource:
        typeof FeatureFlagsTelemetryConfigurationSource.REMOTE | typeof FeatureFlagsTelemetryConfigurationSource.CACHE
      configurationVersion?: string
      configurationFetchedAt?: number
    }
  | {
      eventType: typeof FeatureFlagsTelemetryEventType.PROVIDER_READY
      providerStatus:
        typeof FeatureFlagsTelemetryProviderStatus.READY | typeof FeatureFlagsTelemetryProviderStatus.STALE
      initLatencyMs: number
    }
  | {
      eventType: typeof FeatureFlagsTelemetryEventType.PROVIDER_ERROR
      errorCode: typeof FeatureFlagsTelemetryErrorCode.PRECOMPUTED_ASSIGNMENTS_FETCH_FAILED
    }
  | { eventType: typeof FeatureFlagsTelemetryEventType.FIRST_EVALUATION }
  | {
      eventType: typeof FeatureFlagsTelemetryEventType.INIT_TIMEOUT
      providerStatus: typeof FeatureFlagsTelemetryProviderStatus.ERROR
      errorCode: typeof FeatureFlagsTelemetryErrorCode.INITIALIZATION_TIMEOUT
      initLatencyMs: number
    }
  | {
      eventType: typeof FeatureFlagsTelemetryEventType.INIT_FAILED
      providerStatus: typeof FeatureFlagsTelemetryProviderStatus.ERROR
      errorCode: typeof FeatureFlagsTelemetryErrorCode.INITIALIZATION_FAILED
      initLatencyMs: number
    }

interface FeatureFlagsTelemetryPayload extends Context {
  product: 'feature_flags'
  event_type: FeatureFlagsLifecycleEvent['eventType']
  timestamp: number
  runtime_id: string
  sequence: number
  application_id?: string
  environment?: string
  sdk_name: string
  sdk_version: string
  evaluation_reporting_enabled: boolean
  configuration_source?:
    typeof FeatureFlagsTelemetryConfigurationSource.REMOTE | typeof FeatureFlagsTelemetryConfigurationSource.CACHE
  configuration_version?: string
  configuration_fetched_at?: number
  provider_status?:
    | typeof FeatureFlagsTelemetryProviderStatus.READY
    | typeof FeatureFlagsTelemetryProviderStatus.STALE
    | typeof FeatureFlagsTelemetryProviderStatus.ERROR
  init_latency_ms?: number
  error_code?:
    | typeof FeatureFlagsTelemetryErrorCode.PRECOMPUTED_ASSIGNMENTS_FETCH_FAILED
    | typeof FeatureFlagsTelemetryErrorCode.INITIALIZATION_TIMEOUT
    | typeof FeatureFlagsTelemetryErrorCode.INITIALIZATION_FAILED
}

/**
 * Identifies the Feature Flags SDK runtime that emits lifecycle transitions.
 *
 * @internal
 */
export interface FeatureFlagsTelemetryOptions {
  applicationId?: string
  environmentName?: string
  sdkName: string
  sdkVersion: string
  evaluationReportingEnabled: boolean
}

/**
 * Adds lifecycle transitions to the Feature Flags telemetry batch and stops its transport.
 *
 * @internal
 */
export interface FeatureFlagsTelemetry {
  add: (event: FeatureFlagsLifecycleEvent) => void
  stop: () => void
  enabled: boolean
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const MAX_ENVIRONMENT_NAME_LENGTH = 200
const MAX_CONFIGURATION_VERSION_LENGTH = 256

/**
 * Starts an unsampled Feature Flags lifecycle event channel.
 *
 * Events use the dedicated flagtelemetry EVP track. The transport does not require the RUM or Logs
 * product SDK to start.
 *
 * @example
 * ```ts
 * const telemetry = startFeatureFlagsTelemetry(configuration, {
 *   sdkName: 'dd-openfeature-browser',
 *   sdkVersion: '1.0.0',
 *   evaluationReportingEnabled: true,
 * })
 * telemetry.add({ eventType: FeatureFlagsTelemetryEventType.SDK_INIT_STARTED })
 * ```
 *
 * @internal
 */
export function startFeatureFlagsTelemetry(
  configuration: Configuration,
  options: FeatureFlagsTelemetryOptions
): FeatureFlagsTelemetry {
  if (configuration.trackingConsent !== TrackingConsent.GRANTED) {
    return { add: noop, stop: noop, enabled: false }
  }

  const batch = createBatch({
    endpoints: [createEndpointBuilder(configuration, 'flagtelemetry')],
    // Lifecycle delivery must never affect Feature Flags SDK behavior.
    reportError: noop,
  })
  const runtimeId = generateUUID()
  const sentEvents = new Set<string>()
  let sequence = 0
  let stopped = false

  return {
    enabled: true,
    add: (event) => {
      const deduplicationKey = `${event.eventType}:${'errorCode' in event ? event.errorCode : ''}`
      if (stopped || sentEvents.has(deduplicationKey)) {
        return
      }

      const payload: FeatureFlagsTelemetryPayload = {
        product: 'feature_flags',
        event_type: event.eventType,
        timestamp: clocksNow().timeStamp,
        runtime_id: runtimeId,
        sequence: ++sequence,
        sdk_name: options.sdkName,
        sdk_version: options.sdkVersion,
        evaluation_reporting_enabled: options.evaluationReportingEnabled,
        ...(isValidApplicationId(options.applicationId) && { application_id: options.applicationId }),
        ...(isValidEnvironmentName(options.environmentName) && { environment: options.environmentName }),
        ...toTelemetryPayloadFields(event),
      }

      sentEvents.add(deduplicationKey)
      try {
        batch.add(payload)
      } catch {
        // Lifecycle delivery must never affect Feature Flags SDK behavior.
      }
    },
    stop: () => {
      if (stopped) {
        return
      }
      stopped = true
      try {
        batch.forceFlush('duration_limit')
      } catch {
        // Lifecycle delivery must never affect Feature Flags SDK behavior.
      } finally {
        try {
          batch.stop()
        } catch {
          // Lifecycle delivery must never affect Feature Flags SDK behavior.
        }
      }
    },
  }
}

function toTelemetryPayloadFields(event: FeatureFlagsLifecycleEvent): Partial<FeatureFlagsTelemetryPayload> {
  switch (event.eventType) {
    case FeatureFlagsTelemetryEventType.CONFIGURATION_RECEIVED:
      return {
        configuration_source: event.configurationSource,
        ...(isValidConfigurationVersion(event.configurationVersion) && {
          configuration_version: event.configurationVersion,
        }),
        ...(event.configurationFetchedAt !== undefined && {
          configuration_fetched_at: event.configurationFetchedAt,
        }),
      }
    case FeatureFlagsTelemetryEventType.PROVIDER_READY:
      return {
        provider_status: event.providerStatus,
        init_latency_ms: event.initLatencyMs,
      }
    case FeatureFlagsTelemetryEventType.PROVIDER_ERROR:
      return { error_code: event.errorCode }
    case FeatureFlagsTelemetryEventType.INIT_TIMEOUT:
    case FeatureFlagsTelemetryEventType.INIT_FAILED:
      return {
        provider_status: event.providerStatus,
        error_code: event.errorCode,
        init_latency_ms: event.initLatencyMs,
      }
    case FeatureFlagsTelemetryEventType.SDK_INIT_STARTED:
    case FeatureFlagsTelemetryEventType.FIRST_EVALUATION:
      return {}
  }
}

function isValidApplicationId(applicationId: string | undefined): applicationId is string {
  return applicationId !== undefined && UUID_PATTERN.test(applicationId)
}

function isValidEnvironmentName(environmentName: string | undefined): environmentName is string {
  return (
    environmentName !== undefined &&
    environmentName.length > 0 &&
    Array.from(environmentName).length <= MAX_ENVIRONMENT_NAME_LENGTH
  )
}

function isValidConfigurationVersion(configurationVersion: string | undefined): configurationVersion is string {
  return (
    configurationVersion !== undefined &&
    configurationVersion.length > 0 &&
    Array.from(configurationVersion).length <= MAX_CONFIGURATION_VERSION_LENGTH
  )
}
