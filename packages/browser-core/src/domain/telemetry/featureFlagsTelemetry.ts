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
  PROVIDER_ERROR: 'provider_error',
} as const

export const FeatureFlagsTelemetryErrorCode = {
  PRECOMPUTED_ASSIGNMENTS_FETCH_FAILED: 'precomputed_assignments_fetch_failed',
} as const

type FeatureFlagsTelemetryPayload = TelemetryFeatureFlagsLifecycleEvent['telemetry']

export interface FeatureFlagsLifecycleEvent {
  eventType: FeatureFlagsTelemetryPayload['event_type']
  errorCode: FeatureFlagsTelemetryPayload['error_code']
}

export interface FeatureFlagsTelemetryOptions {
  applicationId?: string
  environmentName?: string
  sdkName: string
  sdkVersion: string
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
      const deduplicationKey = `${event.eventType}:${event.errorCode}`
      if (sentEvents.has(deduplicationKey)) {
        return
      }

      const clockNow = clocksNow()
      const telemetry: FeatureFlagsTelemetryPayload = {
        type: 'feature_flags_lifecycle',
        product: 'feature_flags',
        event_type: event.eventType,
        error_code: event.errorCode,
        timestamp: clockNow.timeStamp,
        runtime_id: runtimeId,
        sequence: ++sequence,
        sdk_name: options.sdkName,
        sdk_version: options.sdkVersion,
        ...(isValidApplicationId(options.applicationId) && { application_id: options.applicationId }),
        ...(isValidEnvironmentName(options.environmentName) && { environment_name: options.environmentName }),
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
      observable.notify(telemetryEvent)
      sentEvents.add(deduplicationKey)
    },
    stop: transport.flushAndStop,
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
