import { combine } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import type { RumEvent } from './rumEvent.types'

export const enum HookNames {
  Assemble,
}

type RecursivePartialExcept<T, K extends keyof T> = {
  [P in keyof T as P extends K ? never : P]?: T[P] extends object ? RecursivePartialExcept<T[P], never> : T[P]
} & {
  [P in keyof T as P extends K ? P : never]-?: T[P]
}

export type PartialRumEvent = RecursivePartialExcept<RumEvent, 'type'>

export type HookCallbackMap = {
  [HookNames.Assemble]: (param: { eventType: RumEvent['type']; startTime: RelativeTime }) => PartialRumEvent | undefined
}

export type Hooks = ReturnType<typeof startHooks>

export function startHooks() {
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
