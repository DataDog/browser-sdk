import type { TelemetryEvent, TelemetryConfigurationEvent } from './telemetryEvent.types'

export const enum TelemetryType {
  log = 'log',
  configuration = 'configuration',
}

export const enum StatusType {
  debug = 'debug',
  error = 'error',
}

export type RawTelemetryEvent = TelemetryEvent['telemetry']
export type RawConfigurationTelemetryEvent = TelemetryConfigurationEvent['telemetry']['configuration']
