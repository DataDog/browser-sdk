import type { DISCARDED, Duration, HookNames, RelativeTime, SKIPPED } from '@datadog/browser-core'
import { abstractHooks } from '@datadog/browser-core'
import type { RumEvent } from '../rumEvent.types'

// This is a workaround for an issue occurring when the Browser SDK is included in a TypeScript
// project configured with `isolatedModules: true`. Even if the const enum is declared in this
// module, we cannot use it directly to define the EventMap interface keys (TS error: "Cannot access
// ambient const enums when the '--isolatedModules' flag is provided.").
declare const HookNamesAsConst: {
  ASSEMBLE: HookNames.Assemble
}

type RecursivePartialExcept<T, K extends keyof T> = {
  [P in keyof T]?: T[P] extends object ? RecursivePartialExcept<T[P], never> : T[P]
} & {
  [P in K]: T[P]
}

// Define a partial RUM event type.
// Ensuring the `type` field is always present improves type checking, especially in conditional logic in hooks (e.g., `if (eventType === 'view')`).
export type DefaultRumEventAttributes = RecursivePartialExcept<RumEvent, 'type'>

export type HookCallbackMap = {
  [HookNamesAsConst.ASSEMBLE]: (param: {
    eventType: RumEvent['type']
    startTime: RelativeTime
    duration?: Duration | undefined
  }) => DefaultRumEventAttributes | SKIPPED | DISCARDED
}

export type Hooks = ReturnType<typeof createHooks>

export const createHooks = abstractHooks<HookCallbackMap, DefaultRumEventAttributes>
