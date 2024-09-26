import type { RelativeTime } from '@datadog/browser-core'
import type { RumPublicApi } from './boot/rumPublicApi'
import type { RumInitConfiguration } from './domain/configuration'
import type { RumEvent } from './rumEvent.types'

export const enum HookNames {
  Init = 'init',
  Start = 'start',
  Event = 'event',
  TelemetryEvent = 'internal_telemetry',
  Api = 'api',
  InternalContext = 'internal_context',
}

export interface HooksMap {
  [HookNames.Init]: (params: { initConfiguration: RumInitConfiguration; publicApi: RumPublicApi }) => void
  [HookNames.Event]: (params: { event: RumEvent; startTime: RelativeTime }) => void
  [HookNames.Api]: (params: RumPublicApi) => void
}

export type Hooks = ReturnType<typeof startHooks>

export function startHooks() {
  const callbacks: { [key in keyof HooksMap]?: Array<HooksMap[key]> } = {}

  return {
    register<K extends keyof HooksMap>(hookName: K, callback: HooksMap[K]) {
      if (!callbacks[hookName]) {
        callbacks[hookName] = []
      }
      callbacks[hookName].push(callback)
      return {
        unsubscribe: () => {
          callbacks[hookName] = callbacks[hookName]!.filter((other) => callback !== other)
        },
      }
    },
    triggerHook<K extends keyof HooksMap>(hookName: K, data: Parameters<HooksMap[K]>[0]) {
      if (callbacks[hookName]) {
        callbacks[hookName].forEach((callback) => callback(data))
      }
    },
  }
}
