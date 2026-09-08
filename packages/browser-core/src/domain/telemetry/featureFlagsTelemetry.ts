import { clocksNow } from '@datadog/js-core/time'
import { INTAKE_SITE_STAGING } from '@datadog/js-core/transport'
import type { Context } from '../../tools/serialisation/context'
import { Observable } from '../../tools/observable'
import { generateUUID } from '../../tools/utils/stringUtils'
import { noop } from '../../tools/utils/functionUtils'
import type { Configuration } from '../configuration'
import { buildTags } from '../tags'
import type { TelemetryEvent, TelemetryFeatureFlagsLifecycleEvent } from './telemetryEvent.types'
import { startTelemetryTransport, TelemetryService } from './telemetry'

export const FeatureFlagsTelemetryEventType = {
  SDK_INIT_STARTED: 'sdk_init_started',
  CONFIGURATION_RECEIVED: 'configuration_received',
  PROVIDER_READY: 'provider_ready',
  PROVIDER_ERROR: 'provider_error',
  FIRST_EVALUATION: 'first_evaluation',
  INIT_TIMEOUT: 'init_timeout',
  INIT_FAILED: 'init_failed',
} as const

export const FeatureFlagsTelemetryErrorCode = {
  PRECOMPUTED_ASSIGNMENTS_FETCH_FAILED: 'precomputed_assignments_fetch_failed',
  INITIALIZATION_TIMEOUT: 'initialization_timeout',
  INITIALIZATION_FAILED: 'initialization_failed',
} as const

export const FeatureFlagsTelemetryConfigurationSource = {
  REMOTE: 'remote',
  CACHE: 'cache',
} as const

export const FeatureFlagsTelemetryProviderStatus = {
  READY: 'ready',
  STALE: 'stale',
  ERROR: 'error',
} as const

type FeatureFlagsTelemetryPayload = TelemetryFeatureFlagsLifecycleEvent['telemetry']

export type FeatureFlagsLifecycleEvent =
  | { eventType: typeof FeatureFlagsTelemetryEventType.SDK_INIT_STARTED }
  | {
      eventType: typeof FeatureFlagsTelemetryEventType.CONFIGURATION_RECEIVED
      configurationSource: NonNullable<FeatureFlagsTelemetryPayload['configuration_source']>
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

export interface FeatureFlagsTelemetryOptions {
  applicationId?: string
  environmentName?: string
  sdkName: string
  sdkVersion: string
  evaluationReportingEnabled?: boolean
}

export interface FeatureFlagsTelemetry {
  add: (event: FeatureFlagsLifecycleEvent) => void
  stop: () => void
  enabled: boolean
}

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const MAX_ENVIRONMENT_NAME_LENGTH = 200

/**
 * Starts a private, unsampled Feature Flags lifecycle telemetry channel.
 *
 * This initial vertical slice is intentionally enabled only for staging. It does not subscribe to
 * the module-global RUM/Logs telemetry observable and does not require either product SDK to start.
 */
export function startFeatureFlagsTelemetry(
  configuration: Configuration,
  options: FeatureFlagsTelemetryOptions
): FeatureFlagsTelemetry {
  if (configuration.site !== INTAKE_SITE_STAGING) {
    return { add: noop, stop: noop, enabled: false }
  }

  const observable = new Observable<TelemetryEvent & Context>()
  const transport = startTelemetryTransport(configuration, observable)
  const runtimeId = generateUUID()
  const sentEvents = new Set<string>()
  let sequence = 0

  return {
    enabled: true,
    add: (event) => {
      const deduplicationKey = `${event.eventType}:${'errorCode' in event ? event.errorCode : ''}`
      if (sentEvents.has(deduplicationKey)) {
        return
      }

      const clockNow = clocksNow()
      const telemetry: FeatureFlagsTelemetryPayload = {
        type: 'feature_flags_lifecycle',
        product: 'feature_flags',
        event_type: event.eventType,
        timestamp: clockNow.timeStamp,
        runtime_id: runtimeId,
        sequence: ++sequence,
        sdk_name: options.sdkName,
        sdk_version: options.sdkVersion,
        ...(isValidApplicationId(options.applicationId) && { application_id: options.applicationId }),
        ...(isValidEnvironmentName(options.environmentName) && { environment_name: options.environmentName }),
        ...(options.evaluationReportingEnabled !== undefined && {
          evaluation_reporting_enabled: options.evaluationReportingEnabled,
        }),
        ...toTelemetryPayloadFields(event),
      }

      const telemetryEvent = {
        type: 'telemetry',
        date: clockNow.timeStamp,
        service: TelemetryService.FEATURE_FLAGS,
        version: options.sdkVersion,
        source: 'browser',
        _dd: { format_version: 2 },
        telemetry,
        ddtags: buildTags(configuration).join(','),
      } as TelemetryFeatureFlagsLifecycleEvent & Context
      sentEvents.add(deduplicationKey)
      try {
        observable.notify(telemetryEvent)
      } catch {
        // Internal telemetry must never affect Feature Flags SDK behavior.
      }
    },
    stop: transport.flushAndStop,
  }
}

function toTelemetryPayloadFields(event: FeatureFlagsLifecycleEvent): Partial<FeatureFlagsTelemetryPayload> {
  switch (event.eventType) {
    case FeatureFlagsTelemetryEventType.CONFIGURATION_RECEIVED:
      return {
        configuration_source: event.configurationSource,
        ...(event.configurationVersion !== undefined && { configuration_version: event.configurationVersion }),
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
    environmentName !== undefined && environmentName.length > 0 && environmentName.length <= MAX_ENVIRONMENT_NAME_LENGTH
  )
}
