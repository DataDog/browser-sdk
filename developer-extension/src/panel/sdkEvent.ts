import type { TelemetryEvent } from '../../../packages/core/src/domain/telemetry'
import type { LogsEvent } from '../../../packages/logs/src/logsEvent.types'
import type { RumEvent, RumViewEvent } from '../../../packages/rum-core/src/rumEvent.types'

export enum EventSource {
  TELEMETRY = 'telemetry',
  RUM = 'rum',
  LOGS = 'logs',
}

export type SdkEvent = RumEvent | TelemetryEvent | LogsEvent

export function isLogEvent(event: SdkEvent): event is LogsEvent {
  return getEventSource(event) === EventSource.LOGS
}

export function isRumEvent(event: SdkEvent): event is RumEvent {
  return getEventSource(event) === EventSource.RUM
}

export function isRumViewEvent(event: SdkEvent): event is RumViewEvent {
  return isRumEvent(event) && event.type === 'view'
}

export function isTelemetryEvent(event: SdkEvent): event is TelemetryEvent {
  return getEventSource(event) === EventSource.TELEMETRY
}

export function getEventSource(event: SdkEvent): EventSource {
  if (event.status) {
    return EventSource.LOGS
  }

  if (event.type === 'telemetry') {
    return EventSource.TELEMETRY
  }

  return EventSource.RUM
}
