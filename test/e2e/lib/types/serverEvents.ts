import type { TelemetryErrorEvent, TelemetryEvent, TelemetryConfigurationEvent } from '@datadog/browser-core'
import type { RumActionEvent, RumErrorEvent, RumEvent, RumResourceEvent, RumViewEvent } from '@datadog/browser-rum'

export function isRumEvent(event: RumEvent | TelemetryEvent): event is RumEvent {
  return !isTelemetryEvent(event)
}

export function isRumResourceEvent(event: RumEvent): event is RumResourceEvent {
  return event.type === 'resource'
}

export function isRumActionEvent(event: RumEvent): event is RumActionEvent {
  return event.type === 'action'
}

export function isRumViewEvent(event: RumEvent): event is RumViewEvent {
  return event.type === 'view'
}

export function isRumErrorEvent(event: RumEvent): event is RumErrorEvent {
  return event.type === 'error'
}

export function isTelemetryEvent(event: RumEvent | TelemetryEvent): event is TelemetryEvent {
  return event.type === 'telemetry'
}

export function isTelemetryErrorEvent(event: TelemetryEvent): event is TelemetryErrorEvent {
  return isTelemetryEvent(event) && event.telemetry.status === 'error'
}

export function isTelemetryConfigurationEvent(event: TelemetryEvent): event is TelemetryConfigurationEvent {
  return isTelemetryEvent(event) && event.telemetry.type === 'configuration'
}
