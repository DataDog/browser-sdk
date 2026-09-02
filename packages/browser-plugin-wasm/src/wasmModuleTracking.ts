// Intercepts WebAssembly module-creation entry points to record (url, build ID)
// per loaded module. Error collectors read getLoadedWasmModules() to set
// source_type='browser+wasm' and error.wasm_modules on error events.
// Modules loaded lazily after the initial page load are captured automatically
// — the hooks stay active for the lifetime of the page.

import type { RawError } from '@datadog/browser-core'
import { extractWasmBuildId } from './wasmBinaryParser'

export interface RawWasmModule {
  url: string
  build_id: string
}

interface WasmModuleEntry {
  url: string
  buildId: string
}

const registry = new Map<string, WasmModuleEntry>()
let stopTracking: (() => void) | undefined
let trackingClients = 0

export function getLoadedWasmModules(): RawWasmModule[] {
  return Array.from(registry.values(), ({ url, buildId }) => ({ url, build_id: buildId }))
}

const WASM_STACK_FRAME_PATTERNS = [
  /wasm-function(?:\[|@)/i,
  /\[wasm code\]/i,
  /wasm:\/\//i,
  /\.wasm(?=$|[:@)\s]|[?#])/i,
]

export function isWasmError({ stack, causes }: Pick<RawError, 'stack' | 'causes'>): boolean {
  return [stack]
    .concat(causes?.map((cause) => cause.stack) ?? [])
    .some(
      (candidate) => candidate !== undefined && WASM_STACK_FRAME_PATTERNS.some((pattern) => pattern.test(candidate))
    )
}

function recordModule(url: string, buffer: ArrayBufferLike): void {
  if (registry.has(url)) {
    return
  }
  let buildId = ''
  try {
    buildId = extractWasmBuildId(buffer)
  } catch {
    // Parser must never throw — debug info absence is normal.
  }
  registry.set(url, { url, buildId })
}

function recordModuleFromView(url: string, view: ArrayBufferView): void {
  recordModule(url, view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
}

// Extracts build_id from a Response clone without consuming it for the caller.
// Streaming compilation and metadata extraction happen in parallel, but the
// wrapper only resolves once both are done. This guarantees that an error
// thrown immediately by an exported function can reference the loaded module.
function captureFromResponse(response: Response): Promise<void> {
  const url = response.url || '<wasm-instantiate-streaming-no-url>'
  if (registry.has(url)) {
    return Promise.resolve()
  }
  try {
    return response
      .clone()
      .arrayBuffer()
      .then((buffer) => recordModule(url, buffer))
      .catch(() => undefined)
  } catch {
    return Promise.resolve()
  }
}

export function startWasmModuleTracking(): () => void {
  if (typeof WebAssembly === 'undefined') {
    return () => undefined
  }

  trackingClients += 1
  if (!stopTracking) {
    stopTracking = installWasmModuleTracking()
  }

  let stopped = false
  return () => {
    if (stopped) {
      return
    }
    stopped = true
    trackingClients -= 1
    if (trackingClients === 0) {
      stopTracking?.()
      stopTracking = undefined
      registry.clear()
    }
  }
}

function installWasmModuleTracking(): () => void {
  const origInstantiate = WebAssembly.instantiate
  const origCompile = WebAssembly.compile
  const origInstantiateStreaming = WebAssembly.instantiateStreaming
  const origCompileStreaming = WebAssembly.compileStreaming

  // Hook 1: instantiate(bytes | module, imports). For raw bytes, we can read
  // build_id directly; for an already-compiled WebAssembly.Module we have no
  // URL or bytes to inspect — register a placeholder.
  WebAssembly.instantiate = function (this: typeof WebAssembly, source: any, importObject?: any) {
    try {
      if (source instanceof ArrayBuffer) {
        recordModule('<wasm-instantiate-bytes>', source)
      } else if (ArrayBuffer.isView(source)) {
        recordModuleFromView('<wasm-instantiate-bytes>', source)
      } else if (source instanceof WebAssembly.Module) {
        if (!registry.has('<wasm-module-object>')) {
          registry.set('<wasm-module-object>', { url: '<wasm-module-object>', buildId: '' })
        }
      }
    } catch {
      // never let the hook break the host application
    }
    return origInstantiate.call(this, source, importObject)
  } as typeof WebAssembly.instantiate

  WebAssembly.compile = function (this: typeof WebAssembly, bytes: any) {
    try {
      if (bytes instanceof ArrayBuffer) {
        recordModule('<wasm-compile-bytes>', bytes)
      } else if (ArrayBuffer.isView(bytes)) {
        recordModuleFromView('<wasm-compile-bytes>', bytes)
      }
    } catch {
      // intentionally ignored
    }
    return origCompile.call(this, bytes)
  } as typeof WebAssembly.compile

  if (origInstantiateStreaming) {
    WebAssembly.instantiateStreaming = function (source, importObject) {
      return Promise.resolve(source).then((response: Response) => {
        const capturePromise = captureFromResponse(response)
        return Promise.all([origInstantiateStreaming.call(this, response, importObject), capturePromise]).then(
          ([result]) => result
        )
      })
    }
  }

  if (origCompileStreaming) {
    WebAssembly.compileStreaming = function (source) {
      return Promise.resolve(source).then((response: Response) => {
        const capturePromise = captureFromResponse(response)
        return Promise.all([origCompileStreaming.call(this, response), capturePromise]).then(([module]) => module)
      })
    }
  }

  return () => {
    WebAssembly.instantiate = origInstantiate
    WebAssembly.compile = origCompile
    if (origInstantiateStreaming) {
      WebAssembly.instantiateStreaming = origInstantiateStreaming
    }
    if (origCompileStreaming) {
      WebAssembly.compileStreaming = origCompileStreaming
    }
  }
}

// Test-only helper to reset registry state between test cases.
export function resetWasmModuleRegistryForTesting(): void {
  stopTracking?.()
  stopTracking = undefined
  trackingClients = 0
  registry.clear()
}
