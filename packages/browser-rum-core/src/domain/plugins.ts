import type { RumPublicApi } from '../boot/rumPublicApi'
import type { StartRumResult } from '../boot/startRum'
import type { RumInitConfiguration } from './configuration'
import type { Hooks } from './hooks'

/**
 * onInit plugin API options.
 *
 * @experimental
 */
export interface OnInitOptions {
  initConfiguration: RumInitConfiguration
  publicApi: RumPublicApi
  /**
   * SDK hooks. Plugins can register assemble callbacks to enrich events before they are sent.
   * Callbacks registered in `onInit` run before any event is assembled, including events buffered
   * during the pre-start phase.
   */
  hooks?: Hooks
}

/**
 * onRumStart plugin API options.
 *
 * @experimental
 */
export interface OnRumStartOptions {
  /**
   * Add an event to the RUM browser SDK.
   */
  addEvent?: StartRumResult['addEvent']
  /**
   * Add a custom error to the RUM browser SDK.
   */
  addError?: StartRumResult['addError']
}

/**
 * Plugin interface of the RUM browser SDK.
 *
 * The plugins API is unstable and experimental, and may change without
 * notice. Please use only plugins provided by Datadog matching the version of the SDK you are
 * using.
 *
 * @experimental
 */
export interface RumPlugin {
  name: string
  getConfigurationTelemetry?(): Record<string, unknown>
  onInit?(options: OnInitOptions): void
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
