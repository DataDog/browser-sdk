export const ONE_KIBI_BYTE = 1024
export const ONE_MEBI_BYTE = 1024 * ONE_KIBI_BYTE

// eslint-disable-next-line no-control-regex
const HAS_MULTI_BYTES_CHARACTERS = /[^\u0000-\u007F]/

export interface Uint8ArrayBuffer extends Uint8Array {
  readonly buffer: ArrayBuffer

  subarray(begin?: number, end?: number): Uint8ArrayBuffer
}

export function computeBytesCount(candidate: string): number {
  // Accurate bytes count computations can degrade performances when there is a lot of events to process
  if (!HAS_MULTI_BYTES_CHARACTERS.test(candidate)) {
    return candidate.length
  }

  if (window.TextEncoder !== undefined) {
    return new TextEncoder().encode(candidate).length
  }

  return new Blob([candidate]).size
}

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
