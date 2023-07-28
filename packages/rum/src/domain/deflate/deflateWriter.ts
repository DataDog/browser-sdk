import type { DeflateWorkerResponse } from '@datadog/browser-worker'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { addEventListener, addTelemetryDebug, concatBuffers } from '@datadog/browser-core'
import { startDeflateWorker, type DeflateWorker } from './deflateWorker'

export interface DeflateWriter {
  write(data: string, callback: () => void): void
  reset(): void
  compressedBytesCount: number
  compressedBytes: Uint8Array
  rawBytesCount: number
}

export const enum StreamId {
  REPLAY = 1,
}

export function startDeflateWriter(
  configuration: RumConfiguration,
  streamId: StreamId,
  callback: (writer?: DeflateWriter) => void
) {
  startDeflateWorker(configuration, (worker) =>
    callback(worker && createDeflateWriter(configuration, worker, streamId))
  )
}

export function createDeflateWriter(
  configuration: RumConfiguration,
  worker: DeflateWorker,
  streamId: StreamId
): DeflateWriter {
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
    get compressedBytes() {
      if (!compressedData.length) {
        return new Uint8Array(0)
      }

      return concatBuffers(compressedData.concat(compressedDataTrailer))
    },

    get compressedBytesCount() {
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
