import { dateNow } from '@datadog/js-core/time'
import { replaceMockable } from '@datadog/browser-core/test'
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

    it('formats a 64-bit identifier explicitly', () => {
      mockRandomValues((buffer) => (buffer[0] = 0xff))
      const identifier = createTraceIdentifier()

      expect(identifier.toLowDecimalString()).toEqual('255')
      expect(identifier.toHexString()).toEqual('00000000000000ff')
      expect(identifier.toHighHexString()).toBeUndefined()
    })

    it('generates and formats a 128-bit identifier', () => {
      replaceMockable(dateNow, () => 0x12345678 * 1000)
      mockRandomValues((buffer) => (buffer[0] = 0xff))
      const identifier = createTraceIdentifier(128)

      expect(identifier.toString()).toEqual('255')
      expect(identifier.toLowDecimalString()).toEqual('255')
      expect(identifier.toHighHexString()).toEqual('1234567800000000')
      expect(identifier.toHexString()).toEqual('123456780000000000000000000000ff')
    })

    it('masks the timestamp to 32 bits', () => {
      replaceMockable(dateNow, () => 0x112345678 * 1000)
      const identifier = createTraceIdentifier(128)

      expect(identifier.toHighHexString()).toEqual('1234567800000000')
      expect(identifier.toHexString()).toHaveSize(32)
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
    cb(new Uint8Array(bufferView.buffer))
    return bufferView
  })
}
