import type { CanvasCaptureResponse, DeflateWorker, SdkWorkerResponse } from '@datadog/browser-core'
import { addTelemetryDebug, display } from '@datadog/browser-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import { clearTimeout, globalObject, mockable, setTimeout } from '@datadog/js-core/util'
import { addEventListener } from '@datadog/js-core/dom'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { startDeflateWorker } from '../../deflate'
import type { CanvasSnapshot } from './canvasSnapshot'

export const CANVAS_CAPTURE_TIMEOUT = 5 * ONE_SECOND

let hasWarnedUnsupported = false

/**
 * Starts the worker that hashes and encodes canvas captures, or returns undefined if canvas
 * recording can't run in this browser. `onInitializationFailure` is called if the worker fails to
 * start later on.
 */
export function startCanvasWorker(
  configuration: RumConfiguration,
  onInitializationFailure: () => void
): DeflateWorker | undefined {
  const canvasConfiguration = configuration.sessionReplayCanvasRecording
  if (!canvasConfiguration?.enable || canvasConfiguration.maxFramesPerSecond === 0) {
    return
  }
  // OffscreenCanvas is missing on Firefox < 105 and Safari < 16.4
  if (!mockable(globalObject.OffscreenCanvas)) {
    if (!hasWarnedUnsupported) {
      hasWarnedUnsupported = true
      display.warn('Session Replay canvas recording is not supported by this browser.')
      // monitor-until: 2027-04-30
      addTelemetryDebug('Canvas recording unsupported')
    }
    return
  }
  return startDeflateWorker(configuration, 'Datadog Session Replay canvas recording', onInitializationFailure, 'canvas')
}

export function resetCanvasWorkerWarning() {
  hasWarnedUnsupported = false
}

let nextCaptureId = 0

/**
 * Transfers the snapshot bitmap to the worker, and resolves with its response, or with undefined if
 * the worker doesn't respond in time.
 */
export function captureInWorker(
  worker: DeflateWorker,
  snapshot: CanvasSnapshot,
  lastChangeHash: string | undefined,
  { hashingMaxDimension, encodeQuality }: { hashingMaxDimension: number; encodeQuality: number }
): Promise<CanvasCaptureResponse | undefined> {
  const id = nextCaptureId++
  worker.postMessage(
    {
      action: 'captureCanvas',
      id,
      bitmap: snapshot.bitmap,
      canvasWidth: snapshot.canvasWidth,
      canvasHeight: snapshot.canvasHeight,
      lastChangeHash,
      hashingMaxDimension,
      encodeQuality,
    },
    [snapshot.bitmap]
  )

  return new Promise((resolve) => {
    const { stop: removeMessageListener } = addEventListener(
      worker,
      'message',
      ({ data }: MessageEvent<SdkWorkerResponse>) => {
        if (isCanvasCaptureResponse(data) && data.id === id) {
          settle(data)
        }
      }
    )
    const timeoutId = setTimeout(() => settle(undefined), CANVAS_CAPTURE_TIMEOUT)

    function settle(response: CanvasCaptureResponse | undefined) {
      removeMessageListener()
      clearTimeout(timeoutId)
      resolve(response)
    }
  })
}

function isCanvasCaptureResponse(response: SdkWorkerResponse): response is CanvasCaptureResponse {
  return (
    response.type === 'canvasCaptured' || response.type === 'canvasUnchanged' || response.type === 'canvasCaptureFailed'
  )
}
