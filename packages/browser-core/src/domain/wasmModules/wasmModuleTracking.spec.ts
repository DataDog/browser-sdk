import type { RawError } from '../error/error.types'
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
  afterEach(() => {
    resetWasmModuleRegistryForTesting()
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
