import type { DeflateEncoderStreamId, Encoder, EndpointBuilder } from '@datadog/browser-core'
import type { RumPublicApi, Strategy } from '../boot/rumPublicApi'
import type { StartRumResult } from '../boot/startRum'
import type { RumConfiguration, RumInitConfiguration } from './configuration'
import type { LifeCycle } from './lifeCycle'
import type { RumSessionManager } from './rumSessionManager'
import type { ViewHistory } from './contexts/viewHistory'

/**
 * onRumStart plugin API options.
 *
 * @experimental
 */
export interface OnRumStartOptions {
  /**
   * @deprecated Use `addEvent` instead.
   */
  strategy?: Strategy
  /**
   * Add an event to the RUM browser SDK.
   */
  addEvent?: StartRumResult['addEvent']
  /**
   * Add a custom error to the RUM browser SDK.
   */
  addError?: StartRumResult['addError']
  /**
   * Endpoint builder for the profiling intake. Can be used by plugins to send profiling events
   * to the same endpoint as the browser CPU profiler.
   */
  profilingEndpointBuilder?: EndpointBuilder
  /**
   * RUM configuration. Can be used by plugins to access SDK settings such as applicationId,
   * profilingSampleRate, and other profiling endpoint options.
   */
  configuration?: RumConfiguration
  /**
   * LifeCycle instance. Can be used by plugins to subscribe to RUM lifecycle events such as
   * SESSION_EXPIRED, SESSION_RENEWED, and VIEW_CREATED.
   */
  lifeCycle?: LifeCycle
  /**
   * Session manager. Can be used by plugins to find the currently tracked session.
   */
  session?: RumSessionManager
  /**
   * View history. Can be used by plugins to find the current view context.
   */
  viewHistory?: ViewHistory
  /**
   * Factory function to create a deflate encoder for a given stream. Can be used by plugins
   * to compress profile attachments using the same encoder as the browser CPU profiler.
   */
  createEncoder?: (streamId: DeflateEncoderStreamId) => Encoder
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
