import type { Uint8ArrayBuffer } from './utils/byteUtils'
import { concatBuffers } from './utils/byteUtils'
import { noop } from './utils/functionUtils'

/**
 * Read bytes from a ReadableStream until the end of the stream.
 */
export async function readBytesFromStream(stream: ReadableStream<Uint8ArrayBuffer>) {
  const reader = stream.getReader()
  const chunks: Uint8ArrayBuffer[] = []

  while (true) {
    const result = await reader.read()
    if (result.done) {
      break
    }

    chunks.push(result.value)
  }

  reader.cancel().catch(
    // we don't care if cancel fails, but we still need to catch the error to avoid reporting it
    // as an unhandled rejection
    noop
  )

  return concatBuffers(chunks)
}
