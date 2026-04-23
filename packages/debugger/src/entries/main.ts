/**
 * Datadog Browser Live Debugger SDK
 * Provides live debugger capabilities for browser applications.
 *
 * @packageDocumentation
 * @see [Live Debugger Documentation](https://docs.datadoghq.com/tracing/live_debugger/)
 */

import { defineGlobal, getGlobalObject, makePublicApi } from '@datadog/browser-core'
import type { PublicApi, Site } from '@datadog/browser-core'
import { onEntry, onReturn, onThrow, initDebuggerTransport } from '../domain/api'
import { startDeliveryApiPolling } from '../domain/deliveryApi'
import { getProbes } from '../domain/probes'
import { startDebuggerBatch } from '../transport/startDebuggerBatch'

/**
 * Configuration options for initializing the Live Debugger SDK
 */
export interface DebuggerInitConfiguration {
  /**
   * The client token for Datadog. Required for authenticating your application with Datadog.
   *
   * @category Authentication
   */
  clientToken: string

  /**
   * The Datadog site to send data to
   *
   * @category Transport
   * @defaultValue 'datadoghq.com'
   */
  site?: Site

  /**
   * The service name for your application
   *
   * @category Data Collection
   */
  service: string

  /**
   * The application's environment (e.g., prod, staging)
   *
   * @category Data Collection
   */
  env?: string

  /**
   * The application's version
   *
   * @category Data Collection
   */
  version?: string

  /**
   * Polling interval in milliseconds for fetching probe updates
   *
   * @category Delivery API
   * @defaultValue 60000
   */
  pollInterval?: number

  /**
   * A proxy URL for routing SDK requests. When set, delivery API requests are
   * sent to `{proxy}/api/unstable/debugger/frontend/probes` instead of the
   * default Datadog API host derived from `site`.
   *
   * @category Transport
   */
  proxy?: string
}

/**
 * Public API for the Live Debugger browser SDK.
 *
 * @category Main
 */
export interface DebuggerPublicApi extends PublicApi {
  /**
   * Initialize the Live Debugger SDK
   *
   * @category Init
   * @param initConfiguration - Configuration options
   * @example
   * ```ts
   * datadogDebugger.init({
   *   clientToken: '<DATADOG_CLIENT_TOKEN>',
   *   service: 'my-app',
   *   site: 'datadoghq.com',
   *   env: 'production'
   * })
   * ```
   */
  init: (initConfiguration: DebuggerInitConfiguration) => void
}

/**
 * Create the public API for the Live Debugger
 */
function makeDebuggerPublicApi(): DebuggerPublicApi {
  return makePublicApi<DebuggerPublicApi>({
    init: (initConfiguration: DebuggerInitConfiguration) => {
      // Initialize debugger's own transport
      const batch = startDebuggerBatch(initConfiguration)
      initDebuggerTransport(initConfiguration, batch)

      // Expose internal hooks on globalThis for instrumented code
      if (typeof globalThis !== 'undefined') {
        ;(globalThis as any).$dd_entry = onEntry
        ;(globalThis as any).$dd_return = onReturn
        ;(globalThis as any).$dd_throw = onThrow
        ;(globalThis as any).$dd_probes = getProbes
      }

      startDeliveryApiPolling({
        service: initConfiguration.service,
        clientToken: initConfiguration.clientToken,
        site: initConfiguration.site,
        proxy: initConfiguration.proxy,
        env: initConfiguration.env,
        version: initConfiguration.version,
        pollInterval: initConfiguration.pollInterval,
      })
    },
  })
}

/**
 * The global Live Debugger instance. Use this to call Live Debugger methods.
 *
 * @category Main
 * @see {@link DebuggerPublicApi}
 * @see [Live Debugger Documentation](https://docs.datadoghq.com/tracing/live_debugger/)
 */
export const datadogDebugger = makeDebuggerPublicApi()

export interface BrowserWindow extends Window {
  DD_DEBUGGER?: DebuggerPublicApi
}

defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_DEBUGGER', datadogDebugger)
