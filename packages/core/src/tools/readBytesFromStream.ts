import { monitor } from './monitor'
import { noop } from './utils'

type Options = {
  limit: number
  collectStreamBody?: boolean
}
/**
 * Read bytes from a ReadableStream until at least `limit` bytes have been read (or until the end of
 * the stream). The callback is invoked with the at most `limit` bytes, and indicates that the limit
 * has been exceeded if more bytes were available.
 */
export function readBytesFromStream(
  stream: ReadableStream<Uint8Array>,
  callback: (error?: Error, bytes?: Uint8Array, limitExceeded?: boolean) => void,
  options: Options
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

        if (options.collectStreamBody) chunks.push(result.value)
        readBytesCount += result.value.length

        if (readBytesCount > options.limit) {
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

    let bytes: Uint8Array | undefined
    let limitExceeded: boolean | undefined
    if (options.collectStreamBody) {
      let completeBuffer: Uint8Array
      if (chunks.length === 1) {
        // optimization: if the response is small enough to fit in a single buffer (provided by the browser), just
        // use it directly.
        completeBuffer = chunks[0]
      } else {
        // else, we need to copy buffers into a larger buffer to concatenate them.
        completeBuffer = new Uint8Array(readBytesCount)
        let offset = 0
        chunks.forEach((chunk) => {
          completeBuffer.set(chunk, offset)
          offset += chunk.length
        })
      }
      bytes = completeBuffer.slice(0, options.limit)
      limitExceeded = completeBuffer.length > options.limit
    }

    callback(undefined, bytes, limitExceeded)
  }
}
