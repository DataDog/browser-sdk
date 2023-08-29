import type { DeflateWorkerResponse } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { addEventListener, addTelemetryDebug, concatBuffers } from '@datadog/browser-core'
import type { DeflateWorker } from './deflateWorker'

export interface DeflateEncoder {
  write(data: string, callback: () => void): void
  reset(): void
  encodedBytesCount: number
  encodedBytes: Uint8Array
  rawBytesCount: number
}

export const enum DeflateEncoderStreamId {
  REPLAY = 1,
}

export function createDeflateEncoder(
  configuration: RumConfiguration,
  worker: DeflateWorker,
  streamId: DeflateEncoderStreamId
): DeflateEncoder {
  let rawBytesCount = 0
  let compressedData: Uint8Array[] = []
  let compressedDataTrailer: Uint8Array

  let nextWriteActionId = 0
  const pendingWriteActions: Array<{ callback: () => void; id: number }> = []

  const { stop: removeMessageListener } = addEventListener(
    configuration,
    worker,
    'message',
    ({ data }: MessageEvent<DeflateWorkerResponse>) => {
      if (data.type !== 'wrote' || data.streamId !== streamId) {
        return
      }

      const nextPendingAction = pendingWriteActions.shift()
      if (nextPendingAction && nextPendingAction.id === data.id) {
        if (data.id === 0) {
          // Initial state
          rawBytesCount = data.additionalBytesCount
          compressedData = [data.result]
        } else {
          rawBytesCount += data.additionalBytesCount
          compressedData.push(data.result)
        }
        compressedDataTrailer = data.trailer
        nextPendingAction.callback()
      } else {
        removeMessageListener()
        addTelemetryDebug('Worker responses received out of order.')
      }
    }
  )

  return {
    get encodedBytes() {
      if (!compressedData.length) {
        return new Uint8Array(0)
      }

      return concatBuffers(compressedData.concat(compressedDataTrailer))
    },

    get encodedBytesCount() {
      if (!compressedData.length) {
        return 0
      }

      return compressedData.reduce((total, buffer) => total + buffer.length, 0) + compressedDataTrailer.length
    },

    get rawBytesCount() {
      return rawBytesCount
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
      })
      nextWriteActionId += 1
    },

    reset() {
      worker.postMessage({
        action: 'reset',
        streamId,
      })
      nextWriteActionId = 0
    },
  }
}
