import type { Context, RelativeTime, TelemetryEvent } from '@datadog/browser-core'
import type { RumEvent } from './rumEvent.types'
import type { InternalContext } from './domain/contexts/internalContext'

export const enum HookNames {
  Event,
  TelemetryEvent,
  Api,
  InternalContext,
}

export interface HooksMap {
  [HookNames.Event]: (params: { event: RumEvent & Context; startTime: RelativeTime }) => typeof params
  [HookNames.TelemetryEvent]: (params: { event: TelemetryEvent }) => typeof params
  [HookNames.InternalContext]: (params: { internalContext: InternalContext; startTime: RelativeTime }) => typeof params
  [HookNames.Api]: (params: { [key: string]: (...args: any[]) => any }) => typeof params
}

export type HookCallback<K extends keyof HooksMap> = HooksMap[K]

export type Hooks = ReturnType<typeof startHooks>

export function startHooks() {
  const callbacks: { [K in keyof HooksMap]?: Array<(params: any) => any> } = {}

  return {
    register<K extends keyof HooksMap>(hookName: K, callback: HookCallback<K>) {
      if (!callbacks[hookName]) {
        callbacks[hookName] = []
      }
      callbacks[hookName].push(callback)
      return {
        unregister() {
          callbacks[hookName] = callbacks[hookName]!.filter((cb) => cb !== callback)
        },
      }
    },
    triggerHook<K extends keyof HooksMap>(
      hookName: K,
      data: Parameters<HookCallback<K>>[0]
    ): ReturnType<HookCallback<K>> {
      const hookCallbacks = callbacks[hookName] || []

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return hookCallbacks.reduce((result, callback) => callback(result), data) as ReturnType<HookCallback<K>>
    },
  }
}
