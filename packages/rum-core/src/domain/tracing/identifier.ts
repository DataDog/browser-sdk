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

/* eslint-disable no-bitwise */
export function createIdentifier(bits: 63 | 64): BaseIdentifier {
  const buffer: Uint8Array = new Uint8Array(8)
  getCrypto().getRandomValues(buffer)
  if (bits === 63) {
    buffer[0] = buffer[0] & 0x7f // force 63-bit
  }

  function readInt32(offset: number) {
    return buffer[offset] * 16777216 + (buffer[offset + 1] << 16) + (buffer[offset + 2] << 8) + buffer[offset + 3]
  }

  return {
    toString(radix = 10) {
      let high = readInt32(0)
      let low = readInt32(4)
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
/* eslint-enable no-bitwise */

export function toPaddedHexadecimalString(id: BaseIdentifier) {
  const traceId = id.toString(16)
  return Array(17 - traceId.length).join('0') + traceId
}
