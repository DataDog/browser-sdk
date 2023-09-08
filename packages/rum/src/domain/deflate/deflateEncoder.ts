import type {
  DeflateWorkerResponse,
  DeflateEncoder,
  DeflateEncoderStreamId,
  DeflateWorker,
  EncoderResult,
} from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { addEventListener, addTelemetryDebug, assign, concatBuffers } from '@datadog/browser-core'

export function createDeflateEncoder(
  configuration: RumConfiguration,
  worker: DeflateWorker,
  streamId: DeflateEncoderStreamId
): DeflateEncoder {
  let rawBytesCount = 0
  let compressedData: Uint8Array[] = []
  let compressedDataTrailer: Uint8Array

  let nextWriteActionId = 0
  const pendingWriteActions: Array<{
    callback?: (additionalEncodedBytesCount: number) => void
    finished: boolean
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

      rawBytesCount += workerResponse.additionalBytesCount
      compressedData.push(workerResponse.result)
      compressedDataTrailer = workerResponse.trailer

      const nextPendingAction = pendingWriteActions.shift()
      if (nextPendingAction && nextPendingAction.id === workerResponse.id) {
        if (nextPendingAction.callback) {
          nextPendingAction.callback(workerResponse.result.byteLength)
        }
      } else {
        removeMessageListener()
        addTelemetryDebug('Worker responses received out of order.')
      }
    }
  )

  function consumeResult(): EncoderResult<Uint8Array> {
    const output =
      compressedData.length === 0 ? new Uint8Array(0) : concatBuffers(compressedData.concat(compressedDataTrailer))
    const result: EncoderResult<Uint8Array> = {
      rawBytesCount,
      output,
      outputBytesCount: output.byteLength,
      encoding: 'deflate',
    }
    rawBytesCount = 0
    compressedData = []
    return result
  }

  function cancelUnfinishedPendingWriteActions() {
    pendingWriteActions.forEach((pendingWriteAction) => {
      if (!pendingWriteAction.finished) {
        pendingWriteAction.finished = true
        delete pendingWriteAction.callback
      }
    })
  }

  function sendResetIfNeeded() {
    if (nextWriteActionId > 0) {
      worker.postMessage({
        action: 'reset',
        streamId,
      })
      nextWriteActionId = 0
    }
  }

  return {
    isAsync: true,

    get isEmpty() {
      return nextWriteActionId === 0
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
        callback,
        data,
        finished: false,
      })
      nextWriteActionId += 1
    },

    finish(callback) {
      sendResetIfNeeded()

      if (!pendingWriteActions.length) {
        callback(consumeResult())
      } else {
        cancelUnfinishedPendingWriteActions()
        // Wait for the last action to finish before calling the finish callback
        pendingWriteActions[pendingWriteActions.length - 1].callback = () => callback(consumeResult())
      }
    },

    finishSync() {
      sendResetIfNeeded()

      const pendingData = pendingWriteActions
        .filter((pendingWriteAction) => !pendingWriteAction.finished)
        .map((pendingWriteAction) => pendingWriteAction.data)
        .join('')
      cancelUnfinishedPendingWriteActions()
      return assign(consumeResult(), {
        pendingData,
      })
    },

    estimateEncodedBytesCount(data) {
      return data.length / 7
    },

    stop() {
      removeMessageListener()
    },
  }
}
