import { SKIPPED } from '@datadog/js-core/assembly'
import type { RawError } from '@datadog/browser-core'
import type { RumPlugin } from '@datadog/browser-rum-core'
import type { LogsPlugin } from '@datadog/browser-logs'
import { getLoadedWasmModules, isWasmError, startWasmModuleTracking } from './wasmModuleTracking'

/**
 * A plugin that can be registered on either the RUM or the Logs SDK (or both).
 *
 * @experimental
 */
export type WasmPlugin = RumPlugin & LogsPlugin

/**
 * Minimal shape of the SDK hooks the plugin needs. Both the RUM and Logs SDK expose an
 * `assemble` hook with a compatible register callback.
 */
interface WasmPluginHooks {
  assemble: {
    register(callback: (params: WasmPluginAssembleParams) => unknown): unknown
  }
}

interface WasmPluginAssembleParams {
  rawRumEvent?: { error?: Pick<RawError, 'stack' | 'causes'> }
  rawLogsEvent?: { error?: Pick<RawError, 'stack' | 'causes'> }
}

/**
 * Creates the WebAssembly plugin.
 *
 * When registered on `DD_RUM.init({ plugins: [makeWasmPlugin()] })` and/or
 * `DD_LOGS.init({ plugins: [makeWasmPlugin()] })`, it intercepts WebAssembly module creation
 * to record each module's URL and build ID, and enriches error events whose stack trace
 * contains a WebAssembly frame with `source_type: 'browser+wasm'` and the list of loaded
 * `wasm_modules`, so they can be symbolicated against the matching debug symbols.
 *
 * The WebAssembly hooks are installed once and stay active for the lifetime of the page.
 *
 * @experimental
 */
export function makeWasmPlugin(): WasmPlugin {
  return {
    name: 'wasm',
    onInit({ hooks }: { hooks: WasmPluginHooks }) {
      // Start intercepting WebAssembly module creation as early as possible, so modules loaded
      // during the SDK pre-start phase are captured.
      startWasmModuleTracking()

      hooks.assemble.register((params: WasmPluginAssembleParams) => {
        // RUM exposes `rawRumEvent`, Logs exposes `rawLogsEvent`.
        const rawEvent = params.rawRumEvent ?? params.rawLogsEvent
        const error = rawEvent?.error
        if (!error || !isWasmError(error)) {
          return SKIPPED
        }

        return {
          error: {
            source_type: 'browser+wasm',
            wasm_modules: getLoadedWasmModules(),
          },
        }
      })
    },
  } as WasmPlugin
}
