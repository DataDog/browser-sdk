import { combine } from './mergeInto'

export const HookNames = {
  Assemble: 0,
} as const
export type HookNamesEnum = (typeof HookNames)[keyof typeof HookNames]

// This is a workaround for an issue occurring when the Browser SDK is included in a TypeScript
// project configured with `isolatedModules: true`. Even if the const enum is declared in this
// module, we cannot use it directly to define the EventMap interface keys (TS error: "Cannot access
// ambient const enums when the '--isolatedModules' flag is provided.").
export declare const HookNamesAsConst: {
  ASSEMBLE: typeof HookNames.Assemble
}

export type RecursivePartialExcept<T, K extends keyof T = never> = {
  [P in keyof T]?: T[P] extends object ? RecursivePartialExcept<T[P], never> : T[P]
} & {
  [P in K]: T[P]
}

// Discards the event from being sent
export const DISCARDED = 'DISCARDED'
// Skips from the assembly of the event
export const SKIPPED = 'SKIPPED'

export type DISCARDED = typeof DISCARDED
export type SKIPPED = typeof SKIPPED

export type AbstractHooks = ReturnType<typeof abstractHooks>

export function abstractHooks<T extends { [K in HookNamesEnum]: (...args: any[]) => any }, E>() {
  const callbacks: { [K in HookNamesEnum]?: Array<T[K]> } = {}

  return {
    register<K extends HookNamesEnum>(hookName: K, callback: T[K]) {
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
    triggerHook<K extends HookNamesEnum>(hookName: K, param: Parameters<T[K]>[0]): E | DISCARDED | undefined {
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
