export const ONE_KIBI_BYTE = 1024
export const ONE_MEBI_BYTE = 1024 * ONE_KIBI_BYTE

// eslint-disable-next-line no-control-regex
const HAS_MULTI_BYTES_CHARACTERS = /[^\u0000-\u007F]/

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

export function concatBuffers(buffers: Uint8Array[]) {
  const length = buffers.reduce((total, buffer) => total + buffer.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const buffer of buffers) {
    result.set(buffer, offset)
    offset += buffer.length
  }
  return result
}
