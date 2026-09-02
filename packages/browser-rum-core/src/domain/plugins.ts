import { isThenable } from '@datadog/browser-core'
import type { RumPublicApi } from '../boot/rumPublicApi'
import type { StartRumResult } from '../boot/startRum'
import type { RumInitConfiguration } from './configuration'

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
 * `onInit` may abort the SDK initialization by returning (or resolving to) `false`. All plugins'
 * `onInit` are called concurrently and independently; a Promise defers the actual initialization
 * until it resolves, but does not delay any other plugin's `onInit` call.
 *
 * @experimental
 */
export interface RumPlugin {
  name: string
  getConfigurationTelemetry?(): Record<string, unknown>
  onInit?(options: {
    initConfiguration: RumInitConfiguration
    publicApi: RumPublicApi
  }): false | void | Promise<false | void>
  onRumStart?(options: OnRumStartOptions): void
}

/**
 * Calls every plugin's `onInit` method concurrently, without waiting for one to resolve before
 * calling the next. Stays synchronous as long as no plugin returns a thenable.
 * Returns `false` if any plugin returned (or resolved to) `false`, `true` otherwise.
 */
export function callPluginsOnInit(
  plugins: RumPlugin[] | undefined,
  parameter: { initConfiguration: RumInitConfiguration; publicApi: RumPublicApi }
): boolean | Promise<boolean> {
  if (!plugins) {
    return true
  }

  const results = plugins.map((plugin) => plugin.onInit?.(parameter))

  if (results.some(isThenable)) {
    return Promise.all(results as Array<Promise<false | void>>).then((results) => !results.includes(false))
  }

  return !results.includes(false)
}

/**
 * Calls each plugin's `onRumStart` method in order.
 */
export function callPluginsOnRumStart(plugins: RumPlugin[] | undefined, options: OnRumStartOptions): void {
  for (const plugin of plugins ?? []) {
    plugin.onRumStart?.(options)
  }
}
