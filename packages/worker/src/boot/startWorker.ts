/* eslint-disable local-rules/disallow-zone-js-patched-values */
import { Deflate, constants, string2buf } from '../domain/deflate'
import type { DeflateWorkerAction } from '../types'

export function startWorker() {
  monitor(() => {
    let deflate = new Deflate()
    self.addEventListener(
      'message',
      monitor((event: MessageEvent<DeflateWorkerAction>) => {
        const data = event.data
        switch (data.action) {
          case 'init':
            self.postMessage({
              type: 'initialized',
            })
            break

          case 'write': {
            const previousChunksLength = deflate.chunks.length
            const additionalBytesCount = pushData(data.data)
            self.postMessage({
              type: 'wrote',
              id: data.id,
              result: concatBuffers(deflate.chunks.slice(previousChunksLength)),
              additionalBytesCount,
            })
            break
          }

          case 'reset':
            deflate = new Deflate()
            break

          case 'flush': {
            const additionalBytesCount = data.data ? pushData(data.data) : 0
            deflate.push('', constants.Z_FINISH)
            self.postMessage({
              type: 'flushed',
              id: data.id,
              result: deflate.result,
              additionalBytesCount,
            })
            deflate = new Deflate()
            break
          }
        }
      })
    )

    function pushData(data: string) {
      // TextEncoder is not supported on old browser version like Edge 18, therefore we use string2buf
      const binaryData = string2buf(data)
      deflate.push(binaryData, constants.Z_SYNC_FLUSH)
      return binaryData.length
    }
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
