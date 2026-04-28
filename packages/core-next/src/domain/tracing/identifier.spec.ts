import { createIdentifier, toPaddedHexadecimalString } from './identifier'

describe('createIdentifier', () => {
  it('toString(10) returns a decimal string', () => {
    const id = createIdentifier(64)
    const str = id.toString(10)

    expect(/^\d+$/.test(str)).toBe(true)
  })

  it('toString(16) returns a hex string', () => {
    const id = createIdentifier(64)
    const str = id.toString(16)

    expect(/^[0-9a-f]+$/.test(str)).toBe(true)
  })

  it('default toString() returns decimal', () => {
    const id = createIdentifier(64)
    const str = id.toString()

    expect(/^\d+$/.test(str)).toBe(true)
  })

  it('63-bit IDs have cleared MSB (hex starts with 0-7)', () => {
    // Run multiple times to have statistical confidence
    for (let i = 0; i < 20; i++) {
      const id = createIdentifier(63)
      const hex = id.toString(16).padStart(16, '0')
      const firstChar = hex[0]

      expect('01234567'.includes(firstChar!)).toBe(true)
    }
  })

  it('two calls produce different IDs', () => {
    const id1 = createIdentifier(64)
    const id2 = createIdentifier(64)

    expect(id1.toString()).not.toBe(id2.toString())
  })

  describe('toPaddedHexadecimalString', () => {
    it('pads to 16 chars', () => {
      const id = createIdentifier(64)
      const hex = toPaddedHexadecimalString(id)

      expect(hex.length).toBe(16)
    })

    it('returns only hex characters', () => {
      const id = createIdentifier(64)
      const hex = toPaddedHexadecimalString(id)

      expect(/^[0-9a-f]{16}$/.test(hex)).toBe(true)
    })

    it('pads short values with leading zeros', () => {
      // A 63-bit ID with MSB cleared: high 32 bits all zero → might produce short hex
      // We just verify the contract: always 16 chars
      for (let i = 0; i < 10; i++) {
        const id = createIdentifier(63)
        expect(toPaddedHexadecimalString(id).length).toBe(16)
      }
    })
  })
})
