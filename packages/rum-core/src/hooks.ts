import { combine } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import type { RumEvent } from './rumEvent.types'

export const enum HookNames {
  Assemble,
}

type RemoveIndexSignature<T> = {
  [K in keyof T as K extends string ? (string extends K ? never : K) : never]: T[K]
}

type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends object ? RecursivePartial<T[P]> : T[P]
}

export type PartialRumEvent = RecursivePartial<RemoveIndexSignature<RumEvent>>

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
