import { getCrypto } from '../../browser/crypto'
import { createTraceIdentifier, toPaddedHexadecimalString } from './identifier'

describe('TraceIdentifier', () => {
  it('generates a random id', () => {
    const identifier = createTraceIdentifier()

    expect(identifier.toString()).toMatch(/^\d+$/)
  })

  it('formats using base 16', () => {
    mockRandomValues((buffer) => (buffer[buffer.length - 1] = 0xff))
    const identifier = createTraceIdentifier()
    expect(identifier.toString(16)).toEqual('ff')
  })
})

describe('toPaddedHexadecimalString', () => {
  it('should pad the string to 16 characters', () => {
    mockRandomValues((buffer) => (buffer[buffer.length - 1] = 0x01))
    const identifier = createTraceIdentifier()
    expect(toPaddedHexadecimalString(identifier)).toEqual('0000000000000001')
  })
})

function mockRandomValues(cb: (buffer: Uint8Array) => void) {
  spyOn(getCrypto(), 'getRandomValues').and.callFake((bufferView) => {
    cb(new Uint8Array(bufferView!.buffer))
    return bufferView
  })
}
