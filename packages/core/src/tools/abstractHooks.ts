import { combine } from './mergeInto'

export const enum HookNames {
  Assemble,
  AssembleTelemetry,
}

// This is a workaround for an issue occurring when the Browser SDK is included in a TypeScript
// project configured with `isolatedModules: true`. Even if the const enum is declared in this
// module, we cannot use it directly to define the EventMap interface keys (TS error: "Cannot access
// ambient const enums when the '--isolatedModules' flag is provided.").
export declare const HookNamesAsConst: {
  ASSEMBLE: HookNames.Assemble
  ASSEMBLE_TELEMETRY: HookNames.AssembleTelemetry
}

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<RecursivePartial<U>>
    : T[P] extends object | undefined
      ? RecursivePartial<T[P]>
      : T[P]
}

// Discards the event from being sent
export const DISCARDED = 'DISCARDED'
// Skips from the assembly of the event
export const SKIPPED = 'SKIPPED'

export type DISCARDED = typeof DISCARDED
export type SKIPPED = typeof SKIPPED

export type AbstractHooks = ReturnType<typeof abstractHooks>

export function abstractHooks<T extends { [K in HookNames]: (...args: any[]) => unknown }>() {
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
    triggerHook<K extends HookNames>(
      hookName: K,
      param: Parameters<T[K]>[0]
    ): Exclude<ReturnType<T[K]>, SKIPPED> | DISCARDED | undefined {
      const hookCallbacks = callbacks[hookName] || []
      const results: any[] = []

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

      return combine(...(results as [any, any])) as Exclude<ReturnType<T[K]>, SKIPPED>
    },
  }
}
