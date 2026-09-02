import { extractWasmBuildId } from './wasmBinaryParser'

describe('extractWasmBuildId', () => {
  it('hex-encodes the complete build ID section', () => {
    expect(extractWasmBuildId(new Uint8Array([4, 0, 1, 0xab, 0xff]).buffer)).toBe('040001abff')
  })

  it('returns an empty string for an empty build ID section', () => {
    expect(extractWasmBuildId(new Uint8Array([]).buffer)).toBe('')
  })
})
