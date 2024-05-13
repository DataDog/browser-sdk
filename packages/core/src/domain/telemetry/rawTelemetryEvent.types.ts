import type { TelemetryEvent, TelemetryConfigurationEvent, TelemetryUsageEvent } from './telemetryEvent.types'

export const TelemetryType = {
  log: 'log',
  configuration: 'configuration',
  usage: 'usage',
} as const

export const enum StatusType {
  debug = 'debug',
  error = 'error',
}

export interface RuntimeEnvInfo {
  is_local_file: boolean
  is_worker: boolean
}

export type RawTelemetryEvent = TelemetryEvent['telemetry']
export type RawTelemetryConfiguration = TelemetryConfigurationEvent['telemetry']['configuration']
export type RawTelemetryUsage = TelemetryUsageEvent['telemetry']['usage']
