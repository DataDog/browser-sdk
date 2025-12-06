/**
 * Datadog Browser Live Debugger SDK
 * Provides dynamic instrumentation capabilities for browser applications.
 *
 * @packageDocumentation
 * @see [Live Debugger Documentation](https://docs.datadoghq.com/dynamic_instrumentation/)
 */

import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import type { Site } from '@datadog/browser-core'
import { onEntry, onReturn, onThrow, sendDebuggerSnapshot } from '../domain/api'
import { addProbe, getProbes, removeProbe, clearProbes } from '../domain/probes'
import type { Probe } from '../domain/probes'

export type { Probe, ProbeWhere, ProbeWhen, ProbeSampling, InitializedProbe } from '../domain/probes'
export type { CaptureOptions, CapturedValue } from '../domain/capture'
export type { StackFrame } from '../domain/stacktrace'
export type { Site } from '@datadog/browser-core'

/**
 * Configuration options for initializing the Live Debugger SDK
 */
export interface LiveDebuggerInitConfiguration {
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
  service?: string

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
}

/**
 * Public API for the Live Debugger browser SDK.
 *
 * @category Main
 */
export interface LiveDebuggerPublicApi {
  /**
   * Initialize the Live Debugger SDK
   *
   * @category Init
   * @param initConfiguration - Configuration options
   * @example
   * ```ts
   * datadogLiveDebugger.init({
   *   clientToken: '<DATADOG_CLIENT_TOKEN>',
   *   site: 'datadoghq.com',
   *   service: 'my-app',
   *   env: 'production'
   * })
   * ```
   */
  init: (initConfiguration: LiveDebuggerInitConfiguration) => void

  /**
   * Add a new probe to the debugger
   *
   * @category Probes
   * @param probe - Probe configuration
   */
  addProbe: (probe: Probe) => void

  /**
   * Remove a probe by ID
   *
   * @category Probes
   * @param id - Probe ID to remove
   */
  removeProbe: (id: string) => void

  /**
   * Clear all probes
   *
   * @category Probes
   */
  clearProbes: () => void

  /**
   * Send a debugger snapshot to Datadog logs.
   *
   * @category Live Debugger
   * @param message - The log message
   * @param logger - Logger information
   * @param dd - Datadog context information
   * @param snapshot - Debugger snapshot data
   */
  sendDebuggerSnapshot: (message?: string, logger?: any, dd?: any, snapshot?: any) => void
}

/**
 * Create the public API for the Live Debugger
 */
function makeLiveDebuggerPublicApi(): LiveDebuggerPublicApi {
  return {
    init: (initConfiguration: LiveDebuggerInitConfiguration) => {
      // TODO: Store configuration for later use when sending to backend
      // Expose internal hooks on globalThis for instrumented code
      if (typeof globalThis !== 'undefined') {
        ;(globalThis as any).$dd_entry = onEntry
        ;(globalThis as any).$dd_return = onReturn
        ;(globalThis as any).$dd_throw = onThrow
        ;(globalThis as any).$dd_probes = getProbes
      }
    },

    addProbe: (probe: Probe) => {
      addProbe(probe)
    },

    removeProbe: (id: string) => {
      removeProbe(id)
    },

    clearProbes: () => {
      clearProbes()
    },

    sendDebuggerSnapshot: (message?: string, logger?: any, dd?: any, snapshot?: any) => {
      sendDebuggerSnapshot(message, logger, dd, snapshot)
    },
  }
}

/**
 * The global Live Debugger instance. Use this to call Live Debugger methods.
 *
 * @category Main
 * @see {@link LiveDebuggerPublicApi}
 * @see [Live Debugger Documentation](https://docs.datadoghq.com/dynamic_instrumentation/)
 */
export const datadogLiveDebugger = makeLiveDebuggerPublicApi()

interface BrowserWindow extends Window {
  DD_LIVE_DEBUGGER?: LiveDebuggerPublicApi
}

defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_LIVE_DEBUGGER', datadogLiveDebugger)
