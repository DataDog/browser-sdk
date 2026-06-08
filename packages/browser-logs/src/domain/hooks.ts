import type { RelativeTime } from '@datadog/js-core/time'
import type { TelemetryEvent } from '@datadog/browser-core'
import { createHook } from '@datadog/js-core/assembly'
import type { Hook, RecursivePartial } from '@datadog/js-core/assembly'
import type { LogsEvent } from '../logsEvent.types'

export type DefaultLogsEventAttributes = RecursivePartial<LogsEvent>
export type DefaultTelemetryEventAttributes = RecursivePartial<TelemetryEvent>

export type AssembleHook = Hook<{ startTime: RelativeTime }, DefaultLogsEventAttributes>
export type AssembleTelemetryHook = Hook<{ startTime: RelativeTime }, DefaultTelemetryEventAttributes>

export interface Hooks {
  assemble: AssembleHook
  assembleTelemetry: AssembleTelemetryHook
}

export function createHooks(): Hooks {
  return {
    assemble: createHook(),
    assembleTelemetry: createHook(),
  }
}
