import type { TelemetryEvent, TelemetryConfigurationEvent } from './telemetryEvent.types'

export const TelemetryType = {
  log: 'log',
  configuration: 'configuration',
} as const

export const enum StatusType {
  debug = 'debug',
  error = 'error',
}

export type RawTelemetryEvent = TelemetryEvent['telemetry']
export type RawTelemetryConfiguration = TelemetryConfigurationEvent['telemetry']['configuration']
