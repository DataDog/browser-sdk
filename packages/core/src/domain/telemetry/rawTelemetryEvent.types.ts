import type { Context } from '../../tools/context'

export const enum TelemetryType {
  log = 'log',
  configuration = 'configuration',
}

export const enum StatusType {
  debug = 'debug',
  error = 'error',
}

export type RawTelemetryEvent = RawDebugTelemetryEvent | RawErrorTelemetryEvent | RawConfigurationTelemetryEvent

export interface RawDebugTelemetryEvent extends Context {
  message: string
  status: StatusType.debug
  type: TelemetryType.log
  error?: {
    kind?: string
    stack: string
  }
}

export interface RawErrorTelemetryEvent extends Context {
  message: string
  status: StatusType.error
  type: TelemetryType.log
}

export interface RawConfigurationTelemetryEvent {
  type: TelemetryType.configuration
  configuration: any
}
