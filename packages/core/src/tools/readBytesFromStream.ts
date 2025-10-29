import { monitor } from './monitor'
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
export function readBytesFromStream(
  stream: ReadableStream<Uint8ArrayBuffer>,
  callback: (error?: Error, bytes?: Uint8Array, limitExceeded?: boolean) => void,
  options: Options
) {
  const reader = stream.getReader()
  const chunks: Uint8ArrayBuffer[] = []
  let readBytesCount = 0

  readMore()

  function readMore() {
    reader.read().then(
      monitor((result: ReadableStreamReadResult<Uint8ArrayBuffer>) => {
        if (result.done) {
          onDone()
          return
        }

        if (options.collectStreamBody) {
          chunks.push(result.value)
        }
        readBytesCount += result.value.length

        if (readBytesCount > options.bytesLimit) {
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

    let bytes: Uint8ArrayBuffer | undefined
    let limitExceeded: boolean | undefined
    if (options.collectStreamBody) {
      const completeBuffer = concatBuffers(chunks)
      bytes = completeBuffer.slice(0, options.bytesLimit)
      limitExceeded = completeBuffer.length > options.bytesLimit
    }

    callback(undefined, bytes, limitExceeded)
  }
}
