/* eslint-disable local-rules/disallow-zone-js-patched-values */
import { Deflate, constants, string2buf } from '../domain/deflate'
import type { DeflateWorkerAction, DeflateWorkerResponse } from '../types'

export function startWorker() {
  monitor(() => {
    const streams = new Map<number, Deflate>()
    self.addEventListener(
      'message',
      monitor((event: MessageEvent<DeflateWorkerAction>) => {
        const response = handleAction(streams, event.data)
        if (response) {
          self.postMessage(response)
        }
      })
    )
  })()
}

function monitor<Args extends any[], Result>(fn: (...args: Args) => Result): (...args: Args) => Result | undefined {
  return (...args) => {
    try {
      return fn(...args)
    } catch (e) {
      try {
        self.postMessage({
          type: 'errored',
          error: e,
        })
      } catch (_) {
        // DATA_CLONE_ERR, cf https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
        self.postMessage({
          type: 'errored',
          error: String(e),
        })
      }
    }
  }
}

function handleAction(streams: Map<number, Deflate>, message: DeflateWorkerAction): DeflateWorkerResponse | undefined {
  switch (message.action) {
    case 'init':
      return {
        type: 'initialized',
      }

    case 'write': {
      let deflate = streams.get(message.streamId)
      if (!deflate) {
        deflate = new Deflate()
        streams.set(message.streamId, deflate)
      }
      const previousChunksLength = deflate.chunks.length

      // TextEncoder is not supported on old browser version like Edge 18, therefore we use string2buf
      const binaryData = string2buf(message.data)
      deflate.push(binaryData, constants.Z_SYNC_FLUSH)

      return {
        type: 'wrote',
        id: message.id,
        streamId: message.streamId,
        result: concatBuffers(deflate.chunks.slice(previousChunksLength)),
        trailer: makeTrailer(deflate),
        additionalBytesCount: binaryData.length,
      }
    }

    case 'reset':
      streams.delete(message.streamId)
      break
  }
}

function concatBuffers(buffers: Uint8Array[]) {
  const length = buffers.reduce((total, buffer) => total + buffer.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const buffer of buffers) {
    result.set(buffer, offset)
    offset += buffer.length
  }
  return result
}

function makeTrailer(deflate: Deflate): Uint8Array {
  /* eslint-disable no-bitwise */
  const adler = deflate.strm.adler
  // This is essentially the output of a `deflate.push('', constants.Z_FINISH)` operation.
  return new Uint8Array([
    // Empty deflate block
    3,
    0,
    // Adler32 checksum
    (adler >>> 24) & 0xff,
    (adler >>> 16) & 0xff,
    (adler >>> 8) & 0xff,
    adler & 0xff,
  ])
  /* eslint-enable no-bitwise */
}
