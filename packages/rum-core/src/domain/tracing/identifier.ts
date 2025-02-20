interface BaseIdentifier {
  toString(radix?: number): string
}

export interface TraceIdentifier extends BaseIdentifier {
  // We use a brand to distinguish between TraceIdentifier and SpanIdentifier, else TypeScript
  // considers them as the same type
  __brand: 'traceIdentifier'
}

export interface SpanIdentifier extends BaseIdentifier {
  __brand: 'spanIdentifier'
}

export function createTraceIdentifier() {
  return createIdentifier(64) as TraceIdentifier
}

export function createSpanIdentifier() {
  return createIdentifier(63) as SpanIdentifier
}

function createIdentifier(bits: 63 | 64): BaseIdentifier {
  const buffer = crypto.getRandomValues(new Uint32Array(2))
  if (bits === 63) {
    // eslint-disable-next-line no-bitwise
    buffer[buffer.length - 1] >>>= 1 // force 63-bit
  }

  // The `.toString` function is intentionally similar to Number and BigInt `.toString` method.
  //
  // JavaScript numbers can represent integers up to 48 bits, this is why we need two of them to
  // represent a 64 bits identifier. But BigInts don't have this limitation and can represent larger
  // integer values.
  //
  // In the future, when we drop browsers without BigInts support, we could use BigInts to directly
  // represent identifiers by simply returning a BigInt from this function (as all we need is a
  // value with a `.toString` method).
  //
  // Examples:
  //   const buffer = getCrypto().getRandomValues(new Uint32Array(2))
  //   return BigInt(buffer[0]) + BigInt(buffer[1]) << 32n
  //
  //   // Alternative with BigUint64Array (different Browser support than plain bigints!):
  //   return crypto.getRandomValues(new BigUint64Array(1))[0]
  //
  // For now, let's keep using two plain numbers as having two different implementations (one for
  // browsers with BigInt support and one for older browsers) don't bring much value.
  return {
    toString(radix = 10) {
      let high = buffer[1]
      let low = buffer[0]
      let str = ''

      do {
        const mod = (high % radix) * 4294967296 + low
        high = Math.floor(high / radix)
        low = Math.floor(mod / radix)
        str = (mod % radix).toString(radix) + str
      } while (high || low)

      return str
    },
  }
}

export function toPaddedHexadecimalString(id: BaseIdentifier) {
  return id.toString(16).padStart(16, '0')
}
