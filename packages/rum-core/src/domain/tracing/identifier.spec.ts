import { createSpanIdentifier, createTraceIdentifier, toPaddedHexadecimalString } from './identifier'

describe('identifier', () => {
  describe('TraceIdentifier', () => {
    it('generates a random id', () => {
      const identifier = createTraceIdentifier()
      expect(identifier.toString()).toMatch(/^\d+$/)
    })

    it('formats using base 16', () => {
      mockRandomValues((buffer) => (buffer[0] = 0xff))
      const identifier = createTraceIdentifier()
      expect(identifier.toString(16)).toEqual('ff')
    })

    it('should generate a max value of 64 bits', () => {
      mockRandomValues((buffer) => buffer.fill(0xff))
      const identifier = createTraceIdentifier()
      expect(identifier.toString(16)).toEqual('ffffffffffffffff')
    })
  })

  describe('SpanIdentifier', () => {
    it('generates a max value of 63 bits', () => {
      mockRandomValues((buffer) => buffer.fill(0xff))
      const identifier = createSpanIdentifier()
      expect(identifier.toString(16)).toEqual('7fffffffffffffff')
    })
  })
})

describe('toPaddedHexadecimalString', () => {
  it('should pad the string to 16 characters', () => {
    mockRandomValues((buffer) => (buffer[0] = 0x01))
    const identifier = createTraceIdentifier()
    expect(toPaddedHexadecimalString(identifier)).toEqual('0000000000000001')
  })
})

function mockRandomValues(cb: (buffer: Uint8Array) => void) {
  spyOn(window.crypto, 'getRandomValues').and.callFake((bufferView) => {
    cb(new Uint8Array(bufferView!.buffer))
    return bufferView
  })
}
