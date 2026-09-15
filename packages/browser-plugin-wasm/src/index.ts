import { SKIPPED } from '@datadog/js-core/assembly'
import type { RumPlugin, RumPluginOnInitOptions } from '@datadog/browser-rum-core'
import type { LogsPlugin, OnInitOptions as LogsPluginOnInitOptions } from '@datadog/browser-logs'
import { getLoadedWasmModules, isWasmError, startWasmModuleTracking } from './wasmModuleTracking'

/**
 * A plugin that can be registered on either the RUM or the Logs SDK (or both).
 *
 * @experimental
 */
export type WasmPlugin = RumPlugin & LogsPlugin

type RumAssembleCallback = Parameters<RumPluginOnInitOptions['registerAssembleEventHook']>[0]
type RumAssembleParams = Parameters<RumAssembleCallback>[0]
type RumAssembleResult = ReturnType<RumAssembleCallback>
type LogsAssembleCallback = Parameters<LogsPluginOnInitOptions['registerAssembleEventHook']>[0]
type LogsAssembleParams = Parameters<LogsAssembleCallback>[0]
type LogsAssembleResult = ReturnType<LogsAssembleCallback>

function assembleWasmEvent(params: RumAssembleParams): RumAssembleResult
function assembleWasmEvent(params: LogsAssembleParams): LogsAssembleResult
function assembleWasmEvent(params: RumAssembleParams | LogsAssembleParams): RumAssembleResult | LogsAssembleResult {
  const rawEvent = 'rawRumEvent' in params ? params.rawRumEvent : params.rawLogsEvent
  const error = 'error' in rawEvent ? rawEvent.error : undefined
  if (!error || !isWasmError(error)) {
    return SKIPPED
  }

  return {
    error: {
      source_type: 'browser+wasm',
      wasm_modules: getLoadedWasmModules(),
    },
  }
}

function onInit(options: RumPluginOnInitOptions): void
function onInit(options: LogsPluginOnInitOptions): void
function onInit(options: RumPluginOnInitOptions | LogsPluginOnInitOptions): void {
  // Start intercepting WebAssembly module creation as early as possible, so modules loaded
  // during the SDK pre-start phase are captured.
  startWasmModuleTracking()
  options.registerAssembleEventHook(assembleWasmEvent)
}

/**
 * Creates the WebAssembly plugin.
 *
 * When registered on `DD_RUM.init({ plugins: [wasmPlugin()] })` and/or
 * `DD_LOGS.init({ plugins: [wasmPlugin()] })`, it intercepts WebAssembly module creation
 * to record each module's URL and build ID, and enriches error events whose stack trace
 * contains a WebAssembly frame with `source_type: 'browser+wasm'` and the list of loaded
 * `wasm_modules`, so they can be symbolicated against the matching debug symbols.
 *
 * The WebAssembly hooks are installed once and stay active for the lifetime of the page.
 *
 * @experimental
 */
export function wasmPlugin(): WasmPlugin {
  const plugin: WasmPlugin = {
    name: 'wasm',
    onInit,
  }

  return plugin
}
