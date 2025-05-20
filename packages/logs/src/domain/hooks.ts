import type { DISCARDED, HookNamesAsConst, RecursivePartialExcept, RelativeTime, SKIPPED } from '@datadog/browser-core'
import { abstractHooks } from '@datadog/browser-core'
import type { LogsEvent } from '../logsEvent.types'

export type DefaultLogsEventAttributes = RecursivePartialExcept<LogsEvent>

export type HookCallbackMap = {
  [HookNamesAsConst.ASSEMBLE]: (param: { startTime: RelativeTime }) => DefaultLogsEventAttributes | SKIPPED | DISCARDED
}

export type Hooks = ReturnType<typeof createHooks>

export const createHooks = abstractHooks<HookCallbackMap, DefaultLogsEventAttributes>
