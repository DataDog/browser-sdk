import type { Uint8ArrayBuffer } from './utils/byteUtils'
import { concatBuffers } from './utils/byteUtils'
import { noop } from './utils/functionUtils'

interface Options {
  bytesLimit: number
  collectStreamBody?: boolean
}

/**
 * Read bytes from a ReadableStream until at least `limit` bytes have been read (or until the end of
 * the stream). The callback is invoked with the at most `limit` bytes, and indicates that the limit
 * has been exceeded if more bytes were available.
 */
export async function readBytesFromStream(stream: ReadableStream<Uint8ArrayBuffer>, options: Options) {
  const reader = stream.getReader()
  const chunks: Uint8ArrayBuffer[] = []
  let readBytesCount = 0

  while (true) {
    const result = await reader.read()
    if (result.done) {
      break
    }

    if (options.collectStreamBody) {
      chunks.push(result.value)
    }
    readBytesCount += result.value.length

    if (readBytesCount > options.bytesLimit) {
      break
    }
  }

  reader.cancel().catch(
    // we don't care if cancel fails, but we still need to catch the error to avoid reporting it
    // as an unhandled rejection
    noop
  )

  let bytes: Uint8ArrayBuffer | undefined
  if (options.collectStreamBody) {
    const completeBuffer = concatBuffers(chunks)
    bytes = completeBuffer.slice(0, options.bytesLimit)
  }

  return { bytes, limitExceeded: readBytesCount > options.bytesLimit }
}
