import { clearTimeout, noop, setTimeout } from '@datadog/browser-core'
import type { TimeoutId } from '@datadog/browser-core'
import { getNodePrivacyLevel, NodePrivacyLevel } from '@datadog/browser-rum-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import type { RecordingScope } from '../recordingScope'
import type { CanvasCaptureAttempt } from '../canvas/canvasManager'
import { CanvasStatus } from '../canvas/canvasManager'
import { captureCanvasImage, createCanvasSnapshot } from '../canvas/canvasSnapshot'
import { computeImageHash } from '../canvas/canvasHash'
import type { Tracker } from './tracker.types'

export const trackCanvasCapture = (scope: RecordingScope, notifyContentMutated: () => void): Tracker => {
  const canvasManager = scope.canvasManager
  const configuration = scope.configuration.sessionReplayCanvasRecording
  const maxFramesPerSecond = configuration?.maxFramesPerSecond ?? 0

  if (!configuration?.enable || maxFramesPerSecond === 0) {
    return { stop: noop }
  }

  let stopped = false
  let captureTimeoutId: TimeoutId | undefined
  const captureInterval = ONE_SECOND / maxFramesPerSecond

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
    const capturableCanvases = canvasManager.takeCapturableCanvases()

    if (stopped) {
      return
    }

    for (const canvas of capturableCanvases) {
      const nodeId = scope.nodeIds.get(canvas)
      if (nodeId === undefined) {
        canvasManager.forgetCanvas(canvas)
        continue
      }
      if (getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel) !== NodePrivacyLevel.ALLOW) {
        canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
        continue
      }
      await captureCanvas(canvas)
    }
  }

  function markDirtyIfCurrent(captureAttempt: CanvasCaptureAttempt, canvas: HTMLCanvasElement) {
    if (captureAttempt.isCurrent()) {
      canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    }
  }

  async function captureCanvas(canvas: HTMLCanvasElement) {
    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    const cancelled = () => stopped || !captureAttempt.isCurrent()

    if (cancelled()) {
      return
    }

    try {
      const snapshot = createCanvasSnapshot(canvas, configuration?.maxImageDimension ?? 1000)
      if (!snapshot) {
        markDirtyIfCurrent(captureAttempt, canvas)
        canvasManager.discardCaptureAttempt(canvas, captureAttempt)
        return // snapshot failed; leave it dirty
      }

      const hash = await computeImageHash(snapshot, configuration?.hashingMaxDimension ?? 100)

      if (cancelled()) {
        return
      }
      if (hash === undefined) {
        markDirtyIfCurrent(captureAttempt, canvas)
        canvasManager.discardCaptureAttempt(canvas, captureAttempt)
        return // hashing failed; leave it dirty
      }

      if (hash === captureAttempt.lastChangeHash) {
        canvasManager.discardCaptureAttempt(canvas, captureAttempt)
        return // unchanged: no capture/output
      }

      const image = await captureCanvasImage(snapshot)
      if (cancelled()) {
        return
      }
      if (!image) {
        markDirtyIfCurrent(captureAttempt, canvas)
        canvasManager.discardCaptureAttempt(canvas, captureAttempt)
        return // encoding failed; leave it dirty
      }

      canvasManager.addCanvasContentMutation({ canvas, captureAttempt, hash, image })
      notifyContentMutated()
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
      stopped = true
      clearTimeout(captureTimeoutId)
    },
  }
}

function isSecurityError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'SecurityError'
}
