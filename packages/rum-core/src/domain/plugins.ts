import type { RumPublicApi, Strategy } from '../boot/rumPublicApi'
import type { StartRumResult } from '../boot/startRum'
import type { RumInitConfiguration } from './configuration'

type OnRumStartOptions = {
  /**
   * @deprecated Use `addEvent` instead.
   */
  strategy?: Strategy
  addEvent?: StartRumResult['addEvent']
}

export interface RumPlugin {
  name: string
  getConfigurationTelemetry?(): Record<string, unknown>
  onInit?(options: { initConfiguration: RumInitConfiguration; publicApi: RumPublicApi }): void
  onRumStart?(options: OnRumStartOptions): void
}

type MethodNames = 'onInit' | 'onRumStart'
type MethodParameter<MethodName extends MethodNames> = Parameters<NonNullable<RumPlugin[MethodName]>>[0]

export function callPluginsMethod<MethodName extends MethodNames>(
  plugins: RumPlugin[] | undefined,
  methodName: MethodName,
  parameter: MethodParameter<MethodName>
): void
export function callPluginsMethod<MethodName extends MethodNames>(
  plugins: RumPlugin[] | undefined,
  methodName: MethodName,
  parameter: any
) {
  if (!plugins) {
    return
  }
  for (const plugin of plugins) {
    const method = plugin[methodName]
    if (method) {
      method(parameter)
    }
  }
}
