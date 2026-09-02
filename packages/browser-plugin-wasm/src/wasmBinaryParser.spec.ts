import { extractWasmBuildId } from './wasmBinaryParser'

const WASM_HEADER = [0, 97, 115, 109, 1, 0, 0, 0]

function customSection(name: string, payload: number[]): number[] {
  const encodedName = Array.from(new TextEncoder().encode(name))
  const contents = [encodedName.length, ...encodedName, ...payload]
  return [0, contents.length, ...contents]
}

function wasmWithSections(...sections: number[][]): ArrayBuffer {
  return new Uint8Array([...WASM_HEADER, ...sections.flat()]).buffer
}

describe('extractWasmBuildId', () => {
  it('extracts and hex-encodes the build_id custom section', () => {
    expect(extractWasmBuildId(wasmWithSections(customSection('build_id', [0, 1, 0xab, 0xff])))).toBe('0001abff')
  })

  it('prefers build_id over external_debug_info regardless of section order', () => {
    const wasm = wasmWithSections(
      customSection('external_debug_info', [1, 2, 3]),
      customSection('build_id', [0xaa, 0xbb])
    )

    expect(extractWasmBuildId(wasm)).toBe('aabb')
  })

  it('uses the trailing 16 bytes of external_debug_info as a fallback', () => {
    const payload = Array.from({ length: 20 }, (_, index) => index)

    expect(extractWasmBuildId(wasmWithSections(customSection('external_debug_info', payload)))).toBe(
      '0405060708090a0b0c0d0e0f10111213'
    )
  })

  it('returns an empty string for invalid or unannotated modules', () => {
    expect(extractWasmBuildId(new Uint8Array([1, 2, 3]).buffer)).toBe('')
    expect(extractWasmBuildId(wasmWithSections())).toBe('')
  })
})
