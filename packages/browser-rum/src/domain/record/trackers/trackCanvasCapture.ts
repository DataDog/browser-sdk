import { clearTimeout, setTimeout, noop, mockable } from '@datadog/js-core/util'
import type { TimeoutId } from '@datadog/js-core/util'
import { addTelemetryDebug } from '@datadog/browser-core'
import { getNodePrivacyLevel, shouldMaskNode } from '@datadog/browser-rum-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import { getDeflateWorker } from '../../deflate'
import type { RecordingScope } from '../recordingScope'
import { CanvasStatus } from '../canvas/canvasManager'
import { copyCanvasSnapshot, createCanvasSnapshot } from '../canvas/canvasSnapshot'
import type { CanvasWorkerFailureReason } from '../canvas/canvasWorker'
import { isCanvasWorkerSupported, startCanvasWorker } from '../canvas/canvasWorker'
import type { Tracker } from './tracker.types'

export const trackCanvasCapture = (
  scope: RecordingScope,
  notifyContentMutated: () => void,
  stopCanvasContentTracking: () => void
): Tracker => {
  const canvasManager = scope.canvasManager
  const configuration = scope.configuration.sessionReplayCanvasRecording

  if (!configuration?.enable || configuration.maxFramesPerSecond === 0) {
    return { stop: noop }
  }

  let stopped = false
  let captureTimeoutId: TimeoutId | undefined
  const captureInterval = ONE_SECOND / configuration.maxFramesPerSecond
  const maxImageDimension = configuration.maxImageDimension

  function stopCapturing() {
    stopped = true
    clearTimeout(captureTimeoutId)
  }

  // Canvas recording stops safely, without affecting the rest of the recording
  function disableCanvasRecording(reason: 'unsupported' | CanvasWorkerFailureReason, error?: string) {
    stopCapturing()
    stopCanvasContentTracking()
    // monitor-until: 2027-04-19
    addTelemetryDebug('Canvas recording disabled', { reason, error })
  }

  if (!mockable(isCanvasWorkerSupported)()) {
    disableCanvasRecording('unsupported')
    return { stop: noop }
  }
  const worker = mockable(getDeflateWorker)()
  if (!worker) {
    disableCanvasRecording('spawn', 'Session Replay worker unavailable')
    return { stop: noop }
  }
  const canvasWorker = mockable(startCanvasWorker)(worker, configuration, disableCanvasRecording)

  function scheduleNextCapture(delay: number) {
    if (!stopped) {
      captureTimeoutId = setTimeout(() => {
        void runCaptureTask()
      }, delay)
    }
  }

  async function runCaptureTask() {
    const startTime = performance.now()

    try {
      await captureDirtyCanvases()
    } finally {
      const taskDuration = performance.now() - startTime
      const nextDelay = Math.max(captureInterval - taskDuration, captureInterval * 0.5)

      scheduleNextCapture(nextDelay)
    }
  }

  async function captureDirtyCanvases() {
    // Canvases stay dirty until the canvas worker is ready
    if (stopped || !canvasWorker.isReady()) {
      return
    }
    const capturableCanvases = canvasManager.takeCapturableCanvases()

    for (const canvas of capturableCanvases) {
      const nodeId = scope.nodeIds.get(canvas)
      if (nodeId === undefined) {
        canvasManager.forgetCanvas(canvas)
        continue
      }
      const privacyLevel = getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel)
      if (shouldMaskNode(canvas, privacyLevel)) {
        canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
        continue
      }
      await captureCanvas(canvas)
    }
  }

  async function captureCanvas(canvas: HTMLCanvasElement) {
    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    const cancelled = () => stopped || !captureAttempt.isCurrent()

    if (cancelled()) {
      return
    }

    try {
      const snapshot = captureAttempt.snapshot
        ? copyCanvasSnapshot(captureAttempt.snapshot)
        : createCanvasSnapshot(canvas, maxImageDimension)
      const result = await canvasWorker.capture(snapshot, captureAttempt.lastChangeHash)

      if (cancelled() || !result) {
        return
      }

      switch (result.type) {
        case 'unchanged':
          canvasManager.discardCaptureAttempt(canvas, captureAttempt)
          return
        case 'failed':
          canvasManager.markCanvas(canvas, result.isSecurityError ? CanvasStatus.Tainted : CanvasStatus.Dirty)
          canvasManager.discardCaptureAttempt(canvas, captureAttempt)
          return
        case 'captured':
          canvasManager.addCanvasContentMutation({ canvas, captureAttempt, hash: result.hash, image: result.image })
          notifyContentMutated()
          return
      }
    } catch (error) {
      if (!cancelled()) {
        canvasManager.markCanvas(canvas, isSecurityError(error) ? CanvasStatus.Tainted : CanvasStatus.Dirty)
        canvasManager.discardCaptureAttempt(canvas, captureAttempt)
      }
    }
  }

  scheduleNextCapture(captureInterval)

  return {
    stop: () => {
      stopCapturing()
      canvasWorker.stop()
    },
  }
}

function isSecurityError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'SecurityError'
}
