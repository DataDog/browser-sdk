import type { RelativeTime } from '@datadog/js-core/time'
import type { TelemetryEvent } from '@datadog/browser-core'
import { createHook } from '@datadog/js-core/assembly'
import type { Hook } from '@datadog/js-core/assembly'
import type { RecursivePartial } from '@datadog/js-core/util'
import type { LogsEvent } from '../logsEvent.types'
import type { RawLogsEvent } from '../rawLogsEvent.types'
import type { LogsEventDomainContext } from '../domainContext.types'

export type DefaultLogsEventAttributes = RecursivePartial<LogsEvent>
export type DefaultTelemetryEventAttributes = RecursivePartial<TelemetryEvent>

export interface AssembleHookParams {
  startTime: RelativeTime
  rawLogsEvent?: RawLogsEvent
  domainContext?: LogsEventDomainContext
}

export type AssembleHook = Hook<AssembleHookParams, DefaultLogsEventAttributes>
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
