import { extractWasmBuildId } from './wasmBinaryParser'

describe('extractWasmBuildId', () => {
  it('extracts and hex-encodes the build ID', () => {
    expect(extractWasmBuildId(new Uint8Array([4, 0, 1, 0xab, 0xff]).buffer)).toBe('0001abff')
  })

  it('supports a LEB128-encoded build ID length', () => {
    const buildId = new Uint8Array(128)
    buildId.fill(0xab)

    expect(extractWasmBuildId(new Uint8Array([0x80, 0x01, ...buildId]).buffer)).toBe('ab'.repeat(128))
  })

  it('returns an empty string for malformed build ID sections', () => {
    expect(extractWasmBuildId(new Uint8Array([]).buffer)).toBe('')
    expect(extractWasmBuildId(new Uint8Array([0x80]).buffer)).toBe('')
    expect(extractWasmBuildId(new Uint8Array([2, 0xab]).buffer)).toBe('')
    expect(extractWasmBuildId(new Uint8Array([1, 0xab, 0xcd]).buffer)).toBe('')
  })
})
