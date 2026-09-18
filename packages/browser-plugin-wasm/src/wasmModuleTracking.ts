// Intercepts WebAssembly module-creation entry points to record module debug metadata
// per loaded module. Error collectors read getLoadedWasmModules() to set
// source_type='browser+wasm' and error.wasm_modules on error events.
// Modules loaded lazily after the initial page load are captured automatically
// — the hooks stay active for the lifetime of the page.

import { instrumentMethod } from '@datadog/browser-core'
import type { RumErrorEvent } from '@datadog/browser-rum-core'
import { extractWasmBuildId } from './wasmBinaryParser'

type SchemaWasmModule = NonNullable<RumErrorEvent['error']['wasm_modules']>[number]

export interface RawWasmModule {
  url: SchemaWasmModule['url']
  build_id: SchemaWasmModule['build_id']
  debug_info_type: NonNullable<SchemaWasmModule['debug_info_type']>
}

interface WasmModuleEntry {
  url: string
  buildId: string
  debugInfoType: RawWasmModule['debug_info_type']
}

const registry = new Map<string, WasmModuleEntry>()
let stopTracking: (() => void) | undefined

export function getLoadedWasmModules(): RawWasmModule[] {
  return Array.from(registry.values(), ({ url, buildId, debugInfoType }) => ({
    url,
    build_id: buildId,
    debug_info_type: debugInfoType,
  }))
}

const WASM_STACK_FRAME_PATTERNS = [
  /wasm-function(?:\[|@)/i,
  /\[wasm code\]/i,
  /wasm:\/\//i,
  /\.wasm(?=$|[:@)\s]|[?#])/i,
]

export function isWasmError({
  stack,
  causes,
}: {
  readonly stack?: string
  readonly causes?: ReadonlyArray<{ readonly stack?: string }>
}): boolean {
  return [stack]
    .concat(causes?.map((cause) => cause.stack) ?? [])
    .some(
      (candidate) => candidate !== undefined && WASM_STACK_FRAME_PATTERNS.some((pattern) => pattern.test(candidate))
    )
}

function recordModule(url: string, module: WebAssembly.Module): void {
  if (registry.has(url)) {
    return
  }

  let buildId = ''
  let hasSourceMap = false
  try {
    const [buildIdSection] = WebAssembly.Module.customSections(module, 'build_id')
    if (buildIdSection) {
      buildId = extractWasmBuildId(buildIdSection)
    }
    hasSourceMap = WebAssembly.Module.customSections(module, 'sourceMappingURL').length > 0
  } catch {
    // Debug info absence or malformed metadata must never break the application.
  }
  registry.set(url, {
    url,
    buildId,
    debugInfoType: buildId ? 'dwarf' : hasSourceMap ? 'sourcemap' : 'unknown',
  })
}

function getResponseUrl(source: Response | PromiseLike<Response>, fallback: string): () => string {
  let url = fallback
  void Promise.resolve(source).then(
    (response) => {
      url = response.url || fallback
    },
    () => undefined
  )
  return () => url
}

function trackPromise<T>(promise: Promise<T>, onFulfilled: (value: T) => void): void {
  void promise.then(onFulfilled, () => undefined)
}

export function startWasmModuleTracking(): void {
  if (typeof WebAssembly !== 'undefined' && !stopTracking) {
    stopTracking = installWasmModuleTracking()
  }
}

function installWasmModuleTracking(): () => void {
  const { stop: stopInstantiate } = instrumentMethod(
    WebAssembly,
    'instantiate',
    ({ parameters: [source], onPostCall }) => {
      if (source instanceof WebAssembly.Module) {
        recordModule('<wasm-module-object>', source)
        return
      }

      onPostCall((result) => {
        trackPromise(result, (instanceOrSource) => {
          if ('module' in instanceOrSource && instanceOrSource.module instanceof WebAssembly.Module) {
            recordModule('<wasm-instantiate-bytes>', instanceOrSource.module)
          }
        })
      })
    }
  )

  const { stop: stopCompile } = instrumentMethod(WebAssembly, 'compile', ({ onPostCall }) => {
    onPostCall((result) => {
      trackPromise(result, (module) => recordModule('<wasm-compile-bytes>', module))
    })
  })

  const { stop: stopInstantiateStreaming } = instrumentMethod(
    WebAssembly,
    'instantiateStreaming',
    ({ parameters: [source], onPostCall }) => {
      const getUrl = getResponseUrl(source, '<wasm-instantiate-streaming-no-url>')
      onPostCall((result) => {
        trackPromise(result, ({ module }) => recordModule(getUrl(), module))
      })
    }
  )

  const { stop: stopCompileStreaming } = instrumentMethod(
    WebAssembly,
    'compileStreaming',
    ({ parameters: [source], onPostCall }) => {
      const getUrl = getResponseUrl(source, '<wasm-compile-streaming-no-url>')
      onPostCall((result) => {
        trackPromise(result, (module) => recordModule(getUrl(), module))
      })
    }
  )

  return () => {
    stopInstantiate()
    stopCompile()
    stopInstantiateStreaming()
    stopCompileStreaming()
  }
}

// Test-only helper to reset registry state between test cases.
export function resetWasmModuleRegistryForTesting(): void {
  stopTracking?.()
  stopTracking = undefined
  registry.clear()
}
