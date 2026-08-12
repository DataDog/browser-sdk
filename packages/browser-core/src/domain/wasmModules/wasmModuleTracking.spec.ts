import type { RawError } from '../error/error.types'
import { registerCleanupTask } from '../../../test'
import {
  getLoadedWasmModules,
  isWasmError,
  resetWasmModuleRegistryForTesting,
  startWasmModuleTracking,
} from './wasmModuleTracking'

function makeError(stack?: string, causes?: RawError['causes']): Pick<RawError, 'stack' | 'causes'> {
  return { stack, causes }
}

describe('isWasmError', () => {
  ;[
    'RuntimeError: unreachable\n  at foo (https://example.com/app.wasm:wasm-function[42]:0x10)',
    'RuntimeError: unreachable\n  at foo @ wasm://wasm/abc123:1:2',
    'RuntimeError: unreachable\n  at foo @ [wasm code]',
    'RuntimeError: unreachable\n  at namedFunction @ https://example.com/app.wasm',
  ].forEach((stack) => {
    it(`detects a WASM frame in ${stack}`, () => {
      expect(isWasmError(makeError(stack))).toBe(true)
    })
  })

  it('detects a WASM frame in an error cause', () => {
    expect(
      isWasmError(
        makeError('Error: wrapper\n  at wrap @ https://example.com/app.js:1:1', [
          {
            message: 'WASM cause',
            source: 'source',
            stack: 'RuntimeError: unreachable\n  at wasm-function[3] @ [wasm code]',
          },
        ])
      )
    ).toBe(true)
  })

  it('does not classify a regular runtime error as WASM', () => {
    expect(isWasmError(makeError('RuntimeError: failure\n  at foo @ https://example.com/app.js:1:1'))).toBe(false)
  })

  it('does not classify a JavaScript file containing .wasm in its name as WASM', () => {
    expect(isWasmError(makeError('Error: failure\n  at foo @ https://example.com/app.wasm.js:1:1'))).toBe(false)
  })
})

describe('startWasmModuleTracking', () => {
  beforeEach(() => {
    registerCleanupTask(resetWasmModuleRegistryForTesting)
  })

  it('records the build ID of modules instantiated from bytes', async () => {
    const wasmModule = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 0, 11, 8, 98, 117, 105, 108, 100, 95, 105, 100, 0xab, 0xcd,
    ])

    startWasmModuleTracking()
    await WebAssembly.instantiate(wasmModule)

    expect(getLoadedWasmModules()).toEqual([{ url: '<wasm-instantiate-bytes>', build_id: 'abcd' }])
  })

  it('records modules compiled from a view without including bytes outside of the view', async () => {
    const wasmModule = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])
    const paddedBuffer = new Uint8Array(wasmModule.length + 2)
    paddedBuffer.set(wasmModule, 1)
    const moduleView = paddedBuffer.subarray(1, paddedBuffer.length - 1)

    startWasmModuleTracking()
    await WebAssembly.compile(moduleView)

    expect(getLoadedWasmModules()).toEqual([{ url: '<wasm-compile-bytes>', build_id: '' }])
  })

  it('waits for module metadata before resolving streaming instantiation', async () => {
    const wasmModule = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 0, 11, 8, 98, 117, 105, 108, 100, 95, 105, 100, 0xab, 0xcd,
    ])
    let resolveArrayBuffer!: (buffer: ArrayBuffer) => void
    const arrayBufferPromise = new Promise<ArrayBuffer>((resolve) => {
      resolveArrayBuffer = resolve
    })
    const response = {
      url: 'https://example.com/module.wasm',
      clone: () => ({ arrayBuffer: () => arrayBufferPromise }),
    } as Response
    const originalInstantiateStreaming = WebAssembly.instantiateStreaming
    const instantiateStreamingSpy = jasmine.createSpy().and.resolveTo({})
    WebAssembly.instantiateStreaming = instantiateStreamingSpy

    const stopTracking = startWasmModuleTracking()
    try {
      let isResolved = false
      const instantiatePromise = WebAssembly.instantiateStreaming(response).then(() => {
        isResolved = true
      })
      await new Promise((resolve) => setTimeout(resolve))

      expect(instantiateStreamingSpy).toHaveBeenCalled()
      expect(isResolved).toBe(false)

      resolveArrayBuffer(wasmModule.buffer)
      await instantiatePromise

      expect(getLoadedWasmModules()).toEqual([{ url: response.url, build_id: 'abcd' }])
    } finally {
      stopTracking()
      if (originalInstantiateStreaming) {
        WebAssembly.instantiateStreaming = originalInstantiateStreaming
      } else {
        delete (WebAssembly as Partial<typeof WebAssembly>).instantiateStreaming
      }
    }
  })

  it('keeps hooks installed until every tracking client stops', () => {
    const originalCompile = WebAssembly.compile
    const stopFirstClient = startWasmModuleTracking()
    const trackedCompile = WebAssembly.compile
    const stopSecondClient = startWasmModuleTracking()

    expect(trackedCompile).not.toBe(originalCompile)
    stopFirstClient()
    expect(WebAssembly.compile).toBe(trackedCompile)
    stopSecondClient()
    expect(WebAssembly.compile).toBe(originalCompile)
  })
})
