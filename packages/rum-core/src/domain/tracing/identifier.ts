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
  // TODO: when Safari 15 becomes the minimum, simplify to:
  //   crypto.getRandomValues(new BigUint64Array(1))[0]
  const buffer = crypto.getRandomValues(new Uint32Array(2))
  // eslint-disable-next-line no-bitwise
  let value = BigInt(buffer[0]) + (BigInt(buffer[1]) << 32n)
  if (bits === 63) {
    // eslint-disable-next-line no-bitwise
    value &= 0x7fffffffffffffffn // force 63-bit by clearing the top bit
  }
  return value
}

export function toPaddedHexadecimalString(id: BaseIdentifier) {
  return id.toString(16).padStart(16, '0')
}
