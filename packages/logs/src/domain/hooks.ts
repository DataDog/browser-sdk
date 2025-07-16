import type {
  DISCARDED,
  HookNamesAsConst,
  RecursivePartialExcept,
  RelativeTime,
  SKIPPED,
  TelemetryEvent,
} from '@datadog/browser-core'
import { abstractHooks } from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'

export type DefaultLogsEventAttributes = RecursivePartialExcept<LogsEvent>
export type DefaultTelemetryEventAttributes = RecursivePartialExcept<TelemetryEvent>

export interface HookCallbackMap {
  [HookNamesAsConst.ASSEMBLE]: (param: { startTime: RelativeTime }) => DefaultLogsEventAttributes | SKIPPED | DISCARDED
  [HookNamesAsConst.ASSEMBLE_TELEMETRY]: (param: {
    startTime: RelativeTime
  }) => DefaultTelemetryEventAttributes | SKIPPED
}

export type Hooks = ReturnType<typeof createHooks>

export const createHooks = abstractHooks<HookCallbackMap>
