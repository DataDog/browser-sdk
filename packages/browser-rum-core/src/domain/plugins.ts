import { isTimeoutError, isThenable, waitForThenable } from '@datadog/browser-core'
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
 * `onInit` may abort the SDK initialization by returning (or resolving to) `false`. Returning a
 * Promise defers the remaining plugins' `onInit` calls and the actual initialization until it
 * resolves.
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

type MethodNames = 'onInit' | 'onRumStart'
type MethodParameter<MethodName extends MethodNames> = Parameters<NonNullable<RumPlugin[MethodName]>>[0]

export function callPluginsMethod(
  plugins: RumPlugin[] | undefined,
  methodName: 'onInit',
  parameter: MethodParameter<'onInit'>
): boolean | Promise<boolean>
export function callPluginsMethod(
  plugins: RumPlugin[] | undefined,
  methodName: 'onRumStart',
  parameter: MethodParameter<'onRumStart'>
): void
export function callPluginsMethod<MethodName extends MethodNames>(
  plugins: RumPlugin[] | undefined,
  methodName: MethodName,
  parameter: any
): any {
  if (methodName === 'onInit') {
    return runOnInitPlugins(plugins, parameter)
  }
  if (!plugins) {
    return
  }
  for (const plugin of plugins) {
    const method = plugin[methodName]
    if (method) {
      // nothing apart from onInit is expected to return a value
      void method(parameter)
    }
  }
}

const DEFAULT_ON_INIT_TIMEOUT = 3000

/**
 * Calls each plugin's `onInit` method in order, stopping (synchronously or asynchronously) as
 * soon as one returns `false`. Stays synchronous as long as no plugin returns a thenable.
 */
function runOnInitPlugins(
  plugins: RumPlugin[] | undefined,
  parameter: { initConfiguration: RumInitConfiguration; publicApi: RumPublicApi }
): boolean | Promise<boolean> {
  if (!plugins) {
    return true
  }
  let index = 0

  function next(): boolean | Promise<boolean> {
    while (index < plugins!.length) {
      const result = plugins![index++].onInit?.(parameter)
      if (isThenable<boolean | void>(result)) {
        return waitForThenable(result, DEFAULT_ON_INIT_TIMEOUT)
          .then((resolved) => (resolved === false ? false : next()))
          .catch((reason) => {
            if (isTimeoutError(reason)) {
              throw new Error(
                `Plugin ${plugins![index - 1].name} onInit() timed out after ${DEFAULT_ON_INIT_TIMEOUT}ms`
              )
            }
            throw reason
          })
      }
      if (result === false) {
        return false
      }
    }
    return true
  }

  return next()
}
