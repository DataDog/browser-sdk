/**
 * Datadog Browser Live Debugger SDK
 * Provides live debugger capabilities for browser applications.
 *
 * @packageDocumentation
 * @see [Live Debugger Documentation](https://docs.datadoghq.com/tracing/live_debugger/)
 */

import { defineGlobal, display, getGlobalObject, makePublicApi, mockable } from '@datadog/browser-core'
import type { PublicApi, Site } from '@datadog/browser-core'
import { initDebuggerTransport, onEntry, onReturn, onThrow } from '../domain/api'
import { startDeliveryApiPolling } from '../domain/deliveryApi'
import { getProbes } from '../domain/probes'
import { startDebuggerBatch } from '../transport/startDebuggerBatch'

export interface DebuggerBuildMetadata {
  version?: string
}

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

export interface BrowserWindow extends Window {
  DD_DEBUGGER?: DebuggerPublicApi
  __DD_LIVE_DEBUGGER_BUILD__?: DebuggerBuildMetadata
  $dd_entry?: typeof onEntry
  $dd_return?: typeof onReturn
  $dd_throw?: typeof onThrow
  $dd_probes?: typeof getProbes
}

function resolveDebuggerVersion(initConfiguration: DebuggerInitConfiguration): string | undefined {
  const buildVersion = getGlobalObject<BrowserWindow>().__DD_LIVE_DEBUGGER_BUILD__?.version

  if (
    initConfiguration.version !== undefined &&
    buildVersion !== undefined &&
    initConfiguration.version !== buildVersion
  ) {
    display.warn(
      `Debugger: init version "${initConfiguration.version}" does not match the build-plugin version "${buildVersion}". Using the init version.`
    )
  }

  return initConfiguration.version ?? buildVersion
}

/**
 * Create the public API for the Live Debugger
 */
function makeDebuggerPublicApi(): DebuggerPublicApi {
  return makePublicApi<DebuggerPublicApi>({
    init: (initConfiguration: DebuggerInitConfiguration) => {
      const resolvedConfiguration = {
        ...initConfiguration,
        version: resolveDebuggerVersion(initConfiguration),
      }

      // Initialize debugger's own transport
      const batch = mockable(startDebuggerBatch)(resolvedConfiguration)
      mockable(initDebuggerTransport)(resolvedConfiguration, batch)

      // Expose internal hooks on globalThis for instrumented code
      const debuggerGlobal = getGlobalObject<BrowserWindow>()
      debuggerGlobal.$dd_entry = onEntry
      debuggerGlobal.$dd_return = onReturn
      debuggerGlobal.$dd_throw = onThrow
      debuggerGlobal.$dd_probes = getProbes

      mockable(startDeliveryApiPolling)({
        service: resolvedConfiguration.service,
        env: resolvedConfiguration.env,
        version: resolvedConfiguration.version,
        pollInterval: resolvedConfiguration.pollInterval,
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

defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_DEBUGGER', datadogDebugger)
