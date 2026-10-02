/**
 * The number of bytes in one kibibyte (KiB).
 */
export const ONE_KIBI_BYTE = 1024

/**
 * The number of bytes in one mebibyte (MiB).
 */
export const ONE_MEBI_BYTE = 1024 * ONE_KIBI_BYTE

// eslint-disable-next-line no-control-regex
const HAS_MULTI_BYTES_CHARACTERS = /[^\u0000-\u007F]/

/**
 * A `Uint8Array` backed by an `ArrayBuffer` (not a `SharedArrayBuffer`).
 *
 * Used throughout the SDK for deflate output and buffer concatenation.
 */
export interface Uint8ArrayBuffer extends Uint8Array {
  readonly buffer: ArrayBuffer

  subarray(begin?: number, end?: number): Uint8ArrayBuffer
}

/**
 * Returns the byte count of a string, accounting for multi-byte characters.
 *
 * Uses a fast ASCII-only shortcut when the string contains no characters above U+007F;
 * otherwise falls back to `TextEncoder` for an accurate count.
 *
 * @param candidate - The string to measure.
 * @returns The number of bytes the string occupies when UTF-8 encoded.
 */
export function computeBytesCount(candidate: string): number {
  // Accurate bytes count computations can degrade performances when there is a lot of events to process
  if (!HAS_MULTI_BYTES_CHARACTERS.test(candidate)) {
    return candidate.length
  }

  return new TextEncoder().encode(candidate).length
}

/**
 * Concatenates multiple `Uint8ArrayBuffer` values into a single buffer.
 *
 * If the array contains a single buffer it is returned as-is to avoid a copy.
 *
 * @param buffers - The buffers to concatenate.
 * @returns A new buffer containing all input buffers in order, or the single input buffer.
 */
export function concatBuffers(buffers: Uint8ArrayBuffer[]): Uint8ArrayBuffer {
  // Optimization: if there is a single buffer, no need to copy it
  if (buffers.length === 1) {
    return buffers[0]
  }

  const length = buffers.reduce((total, buffer) => total + buffer.length, 0)
  const result: Uint8ArrayBuffer = new Uint8Array(length)
  let offset = 0
  for (const buffer of buffers) {
    result.set(buffer, offset)
    offset += buffer.length
  }
  return result
}
