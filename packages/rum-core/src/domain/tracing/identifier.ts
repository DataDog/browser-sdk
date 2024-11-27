import { getCrypto } from '../../browser/crypto'

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

export function createIdentifier(bits: 63 | 64): BaseIdentifier {
  const buffer: Uint32Array = new Uint32Array(2)
  getCrypto().getRandomValues(buffer)
  if (bits === 63) {
    // eslint-disable-next-line no-bitwise
    buffer[buffer.length - 1] >>>= 1 // force 63-bit
  }

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
  const traceId = id.toString(16)
  return Array(17 - traceId.length).join('0') + traceId
}
