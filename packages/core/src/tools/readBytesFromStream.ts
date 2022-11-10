import { monitor } from './monitor'
import { noop } from './utils'

/**
 * Read bytes from a ReadableStream until at least `limit` bytes have been read (or until the end of
 * the stream). The callback is invoked with the at most `limit` bytes, and indicates that the limit
 * has been exceeded if more bytes were available.
 */
export function readBytesFromStream(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  collectStreamBody: boolean,
  callback: (error?: Error, bytes?: Uint8Array, limitExceeded?: boolean) => void
) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let readBytesCount = 0

  readMore()

  function readMore() {
    reader.read().then(
      monitor((result: ReadableStreamDefaultReadResult<Uint8Array>) => {
        if (result.done) {
          onDone()
          return
        }

        collectStreamBody && chunks.push(result.value)
        readBytesCount += result.value.length

        if (readBytesCount > limit) {
          onDone()
        } else {
          readMore()
        }
      }),
      monitor((error) => callback(error))
    )
  }

  function onDone() {
    reader.cancel().catch(
      // we don't care if cancel fails, but we still need to catch the error to avoid reporting it
      // as an unhandled rejection
      noop
    )

    let completeBuffer: Uint8Array | undefined
    if (collectStreamBody) {
      if (chunks.length === 1) {
        // optimization: if the response is small enough to fit in a single buffer (provided by the browser), just
        // use it directly.
        completeBuffer = chunks[0]
      } else {
        // else, we need to copy buffers into a larger buffer to concatenate them.
        completeBuffer = new Uint8Array(readBytesCount)
        let offset = 0
        chunks.forEach((chunk) => {
          ;(completeBuffer as Uint8Array).set(chunk, offset)
          offset += chunk.length
        })
      }
    }

    callback(
      undefined,
      completeBuffer ? completeBuffer.slice(0, limit) : undefined,
      completeBuffer ? completeBuffer.length > limit : undefined
    )
  }
}
