import type {
  DeflateWorkerResponse,
  DeflateEncoder,
  DeflateEncoderStreamId,
  DeflateWorker,
  EncoderResult,
  Uint8ArrayBuffer,
} from '@datadog/browser-core'
import { addEventListener, concatBuffers } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'

export function createDeflateEncoder(
  configuration: RumConfiguration,
  worker: DeflateWorker,
  streamId: DeflateEncoderStreamId
): DeflateEncoder {
  let rawBytesCount = 0
  let compressedData: Uint8ArrayBuffer[] = []
  let compressedDataTrailer: Uint8ArrayBuffer

  let isEmpty = true
  let nextWriteActionId = 0
  const pendingWriteActions: Array<{
    writeCallback?: (additionalEncodedBytesCount: number) => void
    finishCallback?: () => void
    id: number
    data: string
  }> = []

  const { stop: removeMessageListener } = addEventListener(
    configuration,
    worker,
    'message',
    ({ data: workerResponse }: MessageEvent<DeflateWorkerResponse>) => {
      if (workerResponse.type !== 'wrote' || (workerResponse.streamId as DeflateEncoderStreamId) !== streamId) {
        return
      }

      const nextPendingAction = pendingWriteActions[0]
      if (nextPendingAction) {
        if (nextPendingAction.id === workerResponse.id) {
          pendingWriteActions.shift()

          rawBytesCount += workerResponse.additionalBytesCount
          compressedData.push(workerResponse.result)
          compressedDataTrailer = workerResponse.trailer

          if (nextPendingAction.writeCallback) {
            nextPendingAction.writeCallback(workerResponse.result.byteLength)
          } else if (nextPendingAction.finishCallback) {
            nextPendingAction.finishCallback()
          }
        } else if (nextPendingAction.id < workerResponse.id) {
          // Worker responses received out of order
          removeMessageListener()
        }
      }
    }
  )

  function consumeResult(): EncoderResult<Uint8ArrayBuffer> {
    const output =
      compressedData.length === 0 ? new Uint8Array(0) : concatBuffers(compressedData.concat(compressedDataTrailer))
    const result: EncoderResult<Uint8ArrayBuffer> = {
      rawBytesCount,
      output,
      outputBytesCount: output.byteLength,
      encoding: 'deflate',
    }
    rawBytesCount = 0
    compressedData = []
    return result
  }

  function sendResetIfNeeded() {
    if (!isEmpty) {
      worker.postMessage({
        action: 'reset',
        streamId,
      })
      isEmpty = true
    }
  }

  return {
    isAsync: true,

    get isEmpty() {
      return isEmpty
    },

    write(data, callback) {
      worker.postMessage({
        action: 'write',
        id: nextWriteActionId,
        data,
        streamId,
      })
      pendingWriteActions.push({
        id: nextWriteActionId,
        writeCallback: callback,
        data,
      })
      isEmpty = false
      nextWriteActionId += 1
    },

    finish(callback) {
      sendResetIfNeeded()

      if (!pendingWriteActions.length) {
        callback(consumeResult())
      } else {
        // Make sure we do not call any write callback
        pendingWriteActions.forEach((pendingWriteAction) => {
          delete pendingWriteAction.writeCallback
        })

        // Wait for the last action to finish before calling the finish callback
        pendingWriteActions[pendingWriteActions.length - 1].finishCallback = () => callback(consumeResult())
      }
    },

    finishSync() {
      sendResetIfNeeded()
      const pendingData = pendingWriteActions.map((pendingWriteAction) => pendingWriteAction.data).join('')
      // Ignore all pending write actions responses from the worker
      pendingWriteActions.length = 0
      return { ...consumeResult(), pendingData }
    },

    estimateEncodedBytesCount(data) {
      // This is a rough estimation of the data size once it'll be encoded by deflate. We observed
      // that if it's the first chunk of data pushed to the stream, the ratio is lower (3-4), but
      // after that the ratio is greater (10+). We chose 8 here, which (on average) seems to produce
      // requests of the expected size.
      return data.length / 8
    },

    stop() {
      removeMessageListener()
    },
  }
}
