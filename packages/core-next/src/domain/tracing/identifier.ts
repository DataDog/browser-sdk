export interface Identifier {
  toString(radix?: number): string
}

export function createIdentifier(bits: 64 | 63): Identifier {
  const buffer = crypto.getRandomValues(new Uint32Array(2))

  if (bits === 63) {
    buffer[1] >>>= 1
  }

  const low = buffer[0]!
  const high = buffer[1]!

  return {
    toString(radix = 10): string {
      if (radix === 16) {
        return (high >>> 0).toString(16) + (low >>> 0).toString(16).padStart(8, '0')
      }

      // Decimal: use BigInt to avoid precision loss
      const value = (BigInt(high >>> 0) << BigInt(32)) | BigInt(low >>> 0)
      return value.toString(10)
    },
  }
}

export function toPaddedHexadecimalString(id: Identifier): string {
  return id.toString(16).padStart(16, '0')
}
