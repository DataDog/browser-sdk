import { getCrypto } from '../../browser/crypto'
import { createTraceIdentifier } from './identifier'

describe('TraceIdentifier', () => {
  it('should generate id', () => {
    const identifier = createTraceIdentifier()

    expect(identifier.toDecimalString()).toMatch(/^\d+$/)
  })

  it('should pad the string to 16 characters', () => {
    spyOn(getCrypto() as any, 'getRandomValues').and.callFake((buffer: Uint8Array) => {
      buffer[buffer.length - 1] = 0x01
    })
    const identifier = createTraceIdentifier()
    expect(identifier.toPaddedHexadecimalString()).toEqual('0000000000000001')
  })
})
