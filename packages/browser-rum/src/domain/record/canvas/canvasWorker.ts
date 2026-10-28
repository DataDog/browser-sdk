import type { CanvasCaptureResponse, DeflateWorkerResponse } from '@datadog/browser-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import { clearTimeout, setTimeout } from '@datadog/js-core/util'
import { addEventListener } from '@datadog/js-core/dom'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { DeflateWorkerStatus, getDeflateWorkerStatus, startDeflateWorker } from '../../deflate'
import type { CanvasSnapshot } from './canvasSnapshot'

/**
 * Canvas recording hashes and encodes canvases in a 'canvas' worker running in parallel with the
 * deflate worker, so pixels are never read back on the main thread. It needs:
 * - OffscreenCanvas 2D and convertToBlob in workers: Chrome/Edge 69, Firefox 105, Safari 16.4
 * - createImageBitmap resize options: Chrome 54, Firefox 98, Safari 15
 * => Chrome/Edge 69+, Firefox 105+, Safari 16.4+. Elsewhere, canvas recording is disabled.
 *
 * Keep in sync with the `sessionReplayCanvasRecording` documentation.
 */
export function isCanvasWorkerSupported() {
  return typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined'
}

/**
 * A worker that does not answer a capture in time is considered broken. This also covers older
 * self-hosted workers (`workerUrl`), which answer 'init' but ignore 'captureCanvas'.
 */
export const CANVAS_CAPTURE_TIMEOUT_DELAY = 10 * ONE_SECOND

export type CanvasWorkerFailureReason = 'spawn' | 'timeout'

export interface CanvasWorker {
  isReady: () => boolean
  /** Consumes the snapshot. Resolves to undefined when the canvas worker is not ready or stopped. */
  capture: (snapshot: CanvasSnapshot, lastChangeHash: string | undefined) => Promise<CanvasCaptureResponse | undefined>
  stop: () => void
}

// Shared by every recording, so a late response to a stopped recording can't match a newer capture
let nextCaptureId = 0

/**
 * Starts (or reuses) the 'canvas' worker. Calls `onFailure` at most once, after stopping itself.
 */
export function startCanvasWorker(
  configuration: RumConfiguration,
  onFailure: (reason: CanvasWorkerFailureReason) => void
): CanvasWorker {
  const canvasConfiguration = configuration.sessionReplayCanvasRecording!
  const pendingCaptures = new Map<number, (response: CanvasCaptureResponse | undefined) => void>()
  let stopped = false

  const worker = startDeflateWorker(
    configuration,
    'Datadog Session Replay canvas recording',
    () => fail('spawn'),
    'canvas'
  )
  const workerListener =
    worker &&
    addEventListener(worker, 'message', ({ data }: MessageEvent<DeflateWorkerResponse>) => {
      if (data.type === 'canvasCaptured' || data.type === 'canvasUnchanged' || data.type === 'canvasCaptureFailed') {
        pendingCaptures.get(data.id)?.(data)
      }
    })
  if (!worker) {
    fail('spawn')
  }

  function fail(reason: CanvasWorkerFailureReason) {
    if (!stopped) {
      stop()
      onFailure(reason)
    }
  }

  function stop() {
    stopped = true
    workerListener?.stop()
    pendingCaptures.forEach((resolve) => resolve(undefined))
  }

  return {
    isReady: () => !stopped && getDeflateWorkerStatus('canvas') === DeflateWorkerStatus.Initialized,

    capture: async (snapshot, lastChangeHash) => {
      const bitmap = await snapshot.bitmap
      if (stopped || !worker) {
        bitmap.close()
        return undefined
      }

      const id = nextCaptureId++
      return new Promise((resolve) => {
        const captureTimeoutId = setTimeout(() => fail('timeout'), CANVAS_CAPTURE_TIMEOUT_DELAY)
        pendingCaptures.set(id, (response) => {
          clearTimeout(captureTimeoutId)
          pendingCaptures.delete(id)
          resolve(response)
        })
        worker.postMessage(
          {
            action: 'captureCanvas',
            id,
            bitmap,
            canvasWidth: snapshot.canvasWidth,
            canvasHeight: snapshot.canvasHeight,
            lastChangeHash,
            hashingMaxDimension: canvasConfiguration.hashingMaxDimension,
            encodeQuality: canvasConfiguration.encodeQuality,
          },
          [bitmap]
        )
      })
    },

    stop,
  }
}
