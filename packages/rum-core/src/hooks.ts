import { combine } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import type { RumEvent } from './rumEvent.types'

export const enum HookNames {
  Assemble,
}

type RecursivePartialExcept<T, K extends keyof T> = {
  [P in keyof T]?: T[P] extends object ? RecursivePartialExcept<T[P], never> : T[P]
} & {
  [P in K]: T[P]
}

// Define a partial RUM event type.
// Ensuring the `type` field is always present improves type checking, especially in conditional logic in hooks (e.g., `if (eventType === 'view')`).
export type PartialRumEvent = RecursivePartialExcept<RumEvent, 'type'>

// This is a workaround for an issue occurring when the Browser SDK is included in a TypeScript
// project configured with `isolatedModules: true`. Even if the const enum is declared in this
// module, we cannot use it directly to define the EventMap interface keys (TS error: "Cannot access
// ambient const enums when the '--isolatedModules' flag is provided.").
declare const HookNamesAsConst: {
  ASSEMBLE: HookNames.Assemble
}
export type HookCallbackMap = {
  [HookNamesAsConst.ASSEMBLE]: (param: {
    eventType: RumEvent['type']
    startTime: RelativeTime
  }) => PartialRumEvent | undefined
}

export type Hooks = ReturnType<typeof createHooks>

export function createHooks() {
  const callbacks: { [K in HookNames]?: Array<HookCallbackMap[K]> } = {}

  return {
    register<K extends HookNames>(hookName: K, callback: HookCallbackMap[K]) {
      if (!callbacks[hookName]) {
        callbacks[hookName] = []
      }
      callbacks[hookName]!.push(callback)
      return {
        unregister: () => {
          callbacks[hookName] = callbacks[hookName]!.filter((cb) => cb !== callback)
        },
      }
    },
    triggerHook<K extends keyof HookCallbackMap>(
      hookName: K,
      param: Parameters<HookCallbackMap[K]>[0]
    ): ReturnType<HookCallbackMap[K]> {
      const hookCallbacks = callbacks[hookName] || []
      const results = hookCallbacks.map((callback) => callback(param))
      return combine(...(results as [object, object])) as ReturnType<HookCallbackMap[K]>
    },
  }
}
