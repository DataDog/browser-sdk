import type {
  DISCARDED,
  Duration,
  HookNamesAsConst,
  RecursivePartialExcept,
  RelativeTime,
  SKIPPED,
} from '@datadog/browser-core'
import { abstractHooks } from '@datadog/browser-core'
import type { RumEvent } from '../rumEvent.types'

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
