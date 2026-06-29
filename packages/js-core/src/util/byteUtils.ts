/** One kibibyte in bytes (1024). */
export const ONE_KIBI_BYTE = 1024

/** One mebibyte in bytes (1024 × 1024). */
export const ONE_MEBI_BYTE = 1024 * ONE_KIBI_BYTE

// eslint-disable-next-line no-control-regex
const HAS_MULTI_BYTES_CHARACTERS = /[^\u0000-\u007F]/

/**
 * A `Uint8Array` whose underlying storage is a plain `ArrayBuffer`.
 *
 * This is a stricter subtype of `Uint8Array` that guarantees `.buffer` is always an
 * `ArrayBuffer` (not a `SharedArrayBuffer`), making it safe to pass to APIs that require
 * an owned `ArrayBuffer`.
 */
export interface Uint8ArrayBuffer extends Uint8Array {
  readonly buffer: ArrayBuffer

  subarray(begin?: number, end?: number): Uint8ArrayBuffer
}

/**
 * Computes the byte count of a string when encoded as UTF-8.
 *
 * Uses `TextEncoder` for accuracy when multi-byte characters are present, and falls back to
 * the string's `.length` property for ASCII-only strings as a performance optimisation.
 *
 * @param candidate - The string whose byte count to compute.
 * @returns The number of bytes needed to encode `candidate` as UTF-8.
 */
export function computeBytesCount(candidate: string): number {
  // Accurate bytes count computations can degrade performances when there is a lot of events to process
  if (!HAS_MULTI_BYTES_CHARACTERS.test(candidate)) {
    return candidate.length
  }

  return new TextEncoder().encode(candidate).length
}

/**
 * Concatenates multiple `Uint8ArrayBuffer` instances into a single contiguous buffer.
 *
 * As a performance optimisation, returns the input buffer directly when the array contains
 * exactly one element (avoiding an unnecessary copy).
 *
 * @param buffers - The buffers to concatenate, in order.
 * @returns A new `Uint8ArrayBuffer` containing all input buffers joined end-to-end.
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
