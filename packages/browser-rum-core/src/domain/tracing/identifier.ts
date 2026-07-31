import { mockable } from '@datadog/browser-core'
import { dateNow } from '@datadog/js-core/time'

interface BaseIdentifier {
  toString(radix?: number): string
}

export interface TraceIdentifier extends BaseIdentifier {
  toLowDecimalString(): string
  toHexString(): string
  toHighHexString(): string | undefined
}

export interface SpanIdentifier extends BaseIdentifier {
  __brand: 'spanIdentifier'
}

export function createTraceIdentifier(bitLength: 64 | 128 = 64): TraceIdentifier {
  const low = createIdentifier(64)
  const high = bitLength === 128 ? createTraceIdentifierHighBits() : undefined
  const highHex = high === undefined ? undefined : toPaddedHexadecimalString(high)

  return {
    toString: (radix) => low.toString(radix),
    toLowDecimalString: () => low.toString(),
    toHexString: () => `${highHex ?? ''}${toPaddedHexadecimalString(low)}`,
    toHighHexString: () => highHex,
  }
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

function createTraceIdentifierHighBits(): bigint {
  // Keep the trace ID layout aligned with other Datadog SDKs:
  // <32-bit Unix timestamp><32 zero bits><64 random bits>.
  // Mask the timestamp to guarantee that the high part remains 64 bits after 2106.
  // eslint-disable-next-line no-bitwise
  return (BigInt(Math.floor(mockable(dateNow)() / 1000)) & 0xffffffffn) << 32n
}

export function toPaddedHexadecimalString(id: BaseIdentifier) {
  return id.toString(16).padStart(16, '0')
}
