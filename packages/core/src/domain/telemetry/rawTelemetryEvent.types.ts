import type { TelemetryEvent, TelemetryConfigurationEvent, TelemetryUsageEvent } from './telemetryEvent.types'

export const TelemetryType = {
  log: 'log',
  configuration: 'configuration',
  usage: 'usage',
} as const

export const StatusType = {
  debug: 'debug',
  error: 'error',
} as const

export type StatusTypeEnum = (typeof StatusType)[keyof typeof StatusType]

export interface RuntimeEnvInfo {
  is_local_file: boolean
  is_worker: boolean
}

export type RawTelemetryEvent = TelemetryEvent['telemetry']
export type RawTelemetryConfiguration = TelemetryConfigurationEvent['telemetry']['configuration']
export type RawTelemetryUsage = TelemetryUsageEvent['telemetry']['usage']
export type RawTelemetryUsageFeature = TelemetryUsageEvent['telemetry']['usage']['feature']
