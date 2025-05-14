import { combine } from './mergeInto'

export const enum HookNames {
  Assemble,
}

// Discards the event from being sent
export const DISCARDED = 'DISCARDED'
// Skips from the assembly of the event
export const SKIPPED = 'SKIPPED'

export type DISCARDED = typeof DISCARDED
export type SKIPPED = typeof SKIPPED

export function abstractHooks<T extends { [K in HookNames]: (...args: any[]) => any }, E>() {
  const callbacks: { [K in HookNames]?: Array<T[K]> } = {}

  return {
    register<K extends HookNames>(hookName: K, callback: T[K]) {
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
    triggerHook<K extends HookNames>(hookName: K, param: Parameters<T[K]>[0]): E | DISCARDED | undefined {
      const hookCallbacks = callbacks[hookName] || []
      const results = []

      for (const callback of hookCallbacks) {
        const result = callback(param)
        if (result === DISCARDED) {
          return DISCARDED
        }
        if (result === SKIPPED) {
          continue
        }

        results.push(result)
      }

      return combine(...(results as unknown as [object, object])) as E
    },
  }
}
