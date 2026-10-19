import type {
  CanvasCaptureResponse,
  CanvasWorkerRequest,
  CanvasWorkerResponse,
  DeflateWorker,
  DeflateWorkerResponse,
} from '@datadog/browser-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import { clearTimeout, setTimeout } from '@datadog/js-core/util'
import { addEventListener } from '@datadog/js-core/dom'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { CanvasSnapshot } from './canvasSnapshot'

/**
 * Canvas recording hashes and encodes canvases in a worker spawned by the Session Replay worker, so
 * pixels are never read back on the main thread. It needs:
 * - OffscreenCanvas 2D and convertToBlob in workers: Chrome/Edge 69, Firefox 105, Safari 16.4
 * - workers spawned from a dedicated worker: Chrome 69, Firefox 34, Safari 16.4
 * - createImageBitmap resize options: Chrome 54, Firefox 98, Safari 15
 * => Chrome/Edge 69+, Firefox 105+, Safari 16.4+. Elsewhere, canvas recording is disabled.
 *
 * Keep in sync with the `sessionReplayCanvasRecording` documentation.
 */
export function isCanvasWorkerSupported() {
  return typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined'
}

export const CANVAS_WORKER_TIMEOUT_DELAY = 10 * ONE_SECOND

export type CanvasWorkerFailureReason = 'spawn' | 'error' | 'timeout'

export interface CanvasWorker {
  isReady: () => boolean
  /** Consumes the snapshot. Resolves to undefined when the canvas worker is not ready or stopped. */
  capture: (snapshot: CanvasSnapshot, lastChangeHash: string | undefined) => Promise<CanvasCaptureResponse | undefined>
  stop: () => void
}

/**
 * Asks the Session Replay worker to spawn the canvas worker, then talks to it directly through a
 * MessagePort. Calls `onFailure` at most once, after stopping itself.
 */
export function startCanvasWorker(
  worker: DeflateWorker,
  configuration: NonNullable<RumConfiguration['sessionReplayCanvasRecording']>,
  onFailure: (reason: CanvasWorkerFailureReason, error?: string) => void
): CanvasWorker {
  const { port1: port, port2 } = new MessageChannel()
  const pendingCaptures = new Map<number, (response: CanvasCaptureResponse | undefined) => void>()
  let nextCaptureId = 0
  let ready = false
  const readyTimeoutId = setTimeout(() => fail('timeout'), CANVAS_WORKER_TIMEOUT_DELAY)

  const portListener = addEventListener(port, 'message', ({ data }: MessageEvent<CanvasWorkerResponse>) => {
    if (data.type === 'ready') {
      ready = true
      clearTimeout(readyTimeoutId)
    } else {
      pendingCaptures.get(data.id)?.(data)
    }
  })
  const workerListener = addEventListener(worker, 'message', ({ data }: MessageEvent<DeflateWorkerResponse>) => {
    if (data.type === 'canvasWorkerErrored') {
      fail(ready ? 'error' : 'spawn', data.error)
    }
  })
  port.start()
  worker.postMessage({ action: 'startCanvasWorker' }, [port2])

  function fail(reason: CanvasWorkerFailureReason, error?: string) {
    stop()
    onFailure(reason, error)
  }

  function stop() {
    ready = false
    clearTimeout(readyTimeoutId)
    portListener.stop()
    workerListener.stop()
    // The canvas worker closes the channel: closing it here could drop this message
    port.postMessage({ action: 'stop' } satisfies CanvasWorkerRequest)
    pendingCaptures.forEach((resolve) => resolve(undefined))
  }

  return {
    isReady: () => ready,

    capture: async (snapshot, lastChangeHash) => {
      const bitmap = await snapshot.bitmap
      if (!ready) {
        bitmap.close()
        return undefined
      }

      const id = nextCaptureId++
      return new Promise((resolve) => {
        const captureTimeoutId = setTimeout(() => fail('timeout'), CANVAS_WORKER_TIMEOUT_DELAY)
        pendingCaptures.set(id, (response) => {
          clearTimeout(captureTimeoutId)
          pendingCaptures.delete(id)
          resolve(response)
        })
        port.postMessage(
          {
            action: 'capture',
            id,
            bitmap,
            canvasWidth: snapshot.canvasWidth,
            canvasHeight: snapshot.canvasHeight,
            lastChangeHash,
            hashingMaxDimension: configuration.hashingMaxDimension,
            encodeQuality: configuration.encodeQuality,
          } satisfies CanvasWorkerRequest,
          [bitmap]
        )
      })
    },

    stop,
  }
}
