import type { RumPublicApi } from '../boot/rumPublicApi'
import type { RumInitConfiguration } from './configuration'

export interface RumPlugin {
  name: string
  serializeConfiguration?(): Record<string, unknown>
  onInit?(options: { initConfiguration: RumInitConfiguration; publicApi: RumPublicApi }): void
}

type HookNames = 'onInit'
type HookParameter<HookName extends HookNames> = Parameters<NonNullable<RumPlugin[HookName]>>[0]

export function callHook<HookName extends HookNames>(
  plugins: RumPlugin[] | undefined,
  hookName: HookName,
  parameter: HookParameter<HookName>
) {
  if (!plugins) {
    return
  }
  for (const plugin of plugins) {
    const hook = plugin[hookName]
    if (hook) {
      hook(parameter)
    }
  }
}
