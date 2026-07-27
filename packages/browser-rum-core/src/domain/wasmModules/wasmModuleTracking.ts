// Intercepts WebAssembly module-creation entry points to record (url, build_id)
// per loaded module. errorCollection reads getLoadedWasmModules() to set
// source_type='browser+wasm' and error.wasm_modules on error events.
// Modules loaded lazily after the initial page load are captured automatically
// — the hooks stay active for the lifetime of the page.

import { extractWasmBuildId } from './wasmBinaryParser'

export interface WasmModuleEntry {
  url: string
  build_id: string
}

const registry: Map<string, WasmModuleEntry> = new Map()
let installed = false

export function getLoadedWasmModules(): WasmModuleEntry[] {
  return Array.from(registry.values())
}

export function hasLoadedWasmModules(): boolean {
  return registry.size > 0
}

function recordModule(url: string, buffer: ArrayBuffer): void {
  if (registry.has(url)) {
    return
  }
  let buildId = ''
  try {
    buildId = extractWasmBuildId(buffer)
  } catch {
    // Parser must never throw — debug info absence is normal.
  }
  registry.set(url, { url, build_id: buildId })
}

// Extracts build_id from a Response without consuming it for the caller.
// Returns the original response so the actual instantiation can proceed
// without delay; build_id extraction races in parallel.
function captureFromResponseAsync(response: Response): Response {
  const url = response.url || '<wasm-instantiate-streaming-no-url>'
  if (!registry.has(url)) {
    response
      .clone()
      .arrayBuffer()
      .then((buf) => recordModule(url, buf))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[wasm-tracking] capture failed:', err)
      })
  }
  return response
}

export function startWasmModuleTracking(): () => void {
  if (installed || typeof WebAssembly === 'undefined') {
    return () => {}
  }
  installed = true

  const origInstantiate = WebAssembly.instantiate
  const origCompile = WebAssembly.compile
  const origInstantiateStreaming = (WebAssembly as any).instantiateStreaming
  const origCompileStreaming = (WebAssembly as any).compileStreaming

  // Hook 1: instantiate(bytes | module, imports). For raw bytes, we can read
  // build_id directly; for an already-compiled WebAssembly.Module we have no
  // URL or bytes to inspect — register a placeholder.
  WebAssembly.instantiate = function (this: typeof WebAssembly, source: any, importObject?: any) {
    try {
      if (source instanceof ArrayBuffer) {
        recordModule('<wasm-instantiate-bytes>', source)
      } else if (ArrayBuffer.isView(source)) {
        recordModule('<wasm-instantiate-bytes>', (source as ArrayBufferView).buffer as ArrayBuffer)
      } else if (source instanceof WebAssembly.Module) {
        if (!registry.has('<wasm-module-object>')) {
          registry.set('<wasm-module-object>', { url: '<wasm-module-object>', build_id: '' })
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
        recordModule('<wasm-compile-bytes>', (bytes as ArrayBufferView).buffer as ArrayBuffer)
      }
    } catch {
      // intentionally ignored
    }
    return origCompile.call(this, bytes)
  } as typeof WebAssembly.compile

  if (origInstantiateStreaming) {
    ;(WebAssembly as any).instantiateStreaming = function (this: typeof WebAssembly, source: any, importObject?: any) {
      return Promise.resolve(source)
        .then((response: Response) => {
          try {
            captureFromResponseAsync(response)
          } catch {
            // never block instantiation on capture failure
          }
          return origInstantiateStreaming.call(this, response, importObject)
        })
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn('[wasm-tracking] WebAssembly.instantiateStreaming not present, skipping')
  }

  if (origCompileStreaming) {
    ;(WebAssembly as any).compileStreaming = function (this: typeof WebAssembly, source: any) {
      return Promise.resolve(source).then((response: Response) => {
        try {
          captureFromResponseAsync(response)
        } catch {
          // never block compilation on capture failure
        }
        return origCompileStreaming.call(this, response)
      })
    }
  }

  return function stopWasmModuleTracking() {
    WebAssembly.instantiate = origInstantiate
    WebAssembly.compile = origCompile
    if (origInstantiateStreaming) {
      ;(WebAssembly as any).instantiateStreaming = origInstantiateStreaming
    }
    if (origCompileStreaming) {
      ;(WebAssembly as any).compileStreaming = origCompileStreaming
    }
    registry.clear()
    installed = false
  }
}

// Test-only helper to reset registry state between test cases.
export function resetWasmModuleRegistryForTesting(): void {
  registry.clear()
  installed = false
}
