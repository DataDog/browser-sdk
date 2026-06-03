/**
 * Datadog Browser Live Debugger SDK
 * Provides live debugger capabilities for browser applications.
 *
 * @packageDocumentation
 * @see [Live Debugger Documentation](https://docs.datadoghq.com/tracing/live_debugger/)
 */

import { defineGlobal, display, globalObject, makePublicApi, mockable } from '@datadog/browser-core'
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

  /**
   * Maximum number of snapshot events allowed globally per second
   *
   * @category Data Collection
   * @defaultValue 25
   */
  maxSnapshotsPerSecondGlobally?: number

  /**
   * Default maximum number of snapshot events allowed per probe per second
   *
   * @category Data Collection
   * @defaultValue 1
   */
  maxSnapshotsPerSecondPerProbe?: number

  /**
   * Default maximum number of non-snapshot events allowed per probe per second
   *
   * @category Data Collection
   * @defaultValue 5000
   */
  maxNonSnapshotsPerSecondPerProbe?: number

  /**
   * Maximum number of snapshot events a single probe version can send during the page lifetime
   *
   * @category Data Collection
   * @defaultValue 1000
   */
  maxSnapshotsPerProbeLifetime?: number

  /**
   * Maximum number of non-snapshot events a single probe version can send during the page lifetime
   *
   * @category Data Collection
   * @defaultValue 50000
   */
  maxNonSnapshotsPerProbeLifetime?: number

  /**
   * Maximum duration, in milliseconds, that the Delivery API may stay
   * unreachable (network errors or 5xx responses) before the Live Debugger
   * SDK automatically and permanently disables itself for the rest of the
   * page lifetime. Short network glitches under this threshold are
   * tolerated transparently.
   *
   * Must be a positive finite number; otherwise the default is used.
   *
   * @category Delivery API
   * @defaultValue 300000
   */
  maxUnreachableDuration?: number

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
export interface DatadogDebugger extends PublicApi {
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
   *   version: 'my-deployed-build-version',
   * })
   * ```
   */
  init: (initConfiguration: DebuggerInitConfiguration) => void
}

export interface BrowserWindow {
  DD_DEBUGGER?: DatadogDebugger
  __DD_LIVE_DEBUGGER_BUILD__?: DebuggerBuildMetadata
  $dd_entry?: typeof onEntry
  $dd_return?: typeof onReturn
  $dd_throw?: typeof onThrow
  $dd_probes?: typeof getProbes
}

function resolveDebuggerVersion(initConfiguration: DebuggerInitConfiguration): string | undefined {
  const buildVersion = (globalObject as BrowserWindow).__DD_LIVE_DEBUGGER_BUILD__?.version

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
function makeDebuggerPublicApi(): DatadogDebugger {
  return makePublicApi<DatadogDebugger>({
    init: (initConfiguration: DebuggerInitConfiguration) => {
      const resolvedConfiguration = {
        ...initConfiguration,
        version: resolveDebuggerVersion(initConfiguration),
      }

      // Initialize debugger's own transport
      const batch = mockable(startDebuggerBatch)(resolvedConfiguration)
      mockable(initDebuggerTransport)(resolvedConfiguration, batch)

      // Expose internal hooks on globalThis for instrumented code
      const debuggerGlobal = globalObject as BrowserWindow
      debuggerGlobal.$dd_entry = onEntry
      debuggerGlobal.$dd_return = onReturn
      debuggerGlobal.$dd_throw = onThrow
      debuggerGlobal.$dd_probes = getProbes

      mockable(startDeliveryApiPolling)({
        service: resolvedConfiguration.service,
        clientToken: resolvedConfiguration.clientToken,
        site: resolvedConfiguration.site,
        proxy: resolvedConfiguration.proxy,
        env: resolvedConfiguration.env,
        version: resolvedConfiguration.version,
        pollInterval: resolvedConfiguration.pollInterval,
        maxUnreachableDuration: resolvedConfiguration.maxUnreachableDuration,
      })
    },
  })
}

/**
 * The global Live Debugger instance. Use this to call Live Debugger methods.
 *
 * @category Main
 * @see {@link DatadogDebugger}
 * @see [Live Debugger Documentation](https://docs.datadoghq.com/tracing/live_debugger/)
 */
export const datadogDebugger = makeDebuggerPublicApi()

defineGlobal(globalObject as BrowserWindow, 'DD_DEBUGGER', datadogDebugger)
