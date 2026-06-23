import type { RelativeTime } from '@openobserve/js-core/time'
import type { TelemetryEvent } from '@openobserve/browser-core'
import { createHook } from '@openobserve/js-core/assembly'
import type { Hook } from '@openobserve/js-core/assembly'
import type { RecursivePartial } from '@openobserve/js-core/util'
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
