// eslint-disable-next-line import/no-cycle
export type { Telemetry } from './telemetry'
export {
  TelemetryService,
  addTelemetryDebug,
  addTelemetryError,
  startFakeTelemetry,
  resetTelemetry,
  startTelemetry,
  isTelemetryReplicationAllowed,
  addTelemetryConfiguration,
  addTelemetryUsage,
} from './telemetry'

export * from './rawTelemetryEvent.types'
export type {
  TelemetryEvent,
  TelemetryErrorEvent,
  TelemetryDebugEvent,
  TelemetryConfigurationEvent,
  TelemetryUsageEvent,
} from './telemetryEvent.types'
