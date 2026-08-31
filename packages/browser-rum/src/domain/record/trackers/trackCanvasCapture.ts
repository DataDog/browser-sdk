import { clearInterval, noop, setInterval } from '@datadog/browser-core'
import { getNodePrivacyLevel, NodePrivacyLevel } from '@datadog/browser-rum-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import type { RecordingScope } from '../recordingScope'
import type { NodeId } from '../encoding'
import type { CanvasCaptureAttempt } from '../canvas/canvasManager'
import { CanvasStatus } from '../canvas/canvasManager'
import type { CanvasSnapshot } from '../canvas/canvasSnapshot'
import { captureCanvasImage, createCanvasSnapshot } from '../canvas/canvasSnapshot'
import { computeImageHash } from '../canvas/canvasHash'
import type { Tracker } from './tracker.types'

export interface CanvasCapture {
  nodeId: NodeId
  changeHash: string
  image: Blob
}

export type CanvasCaptureCallback = (capture: CanvasCapture) => void

export const trackCanvasCapture = (scope: RecordingScope, onCanvasCapture: CanvasCaptureCallback = noop): Tracker => {
  const canvasManager = scope.canvasManager
  const configuration = scope.configuration.sessionReplayCanvasRecording
  const maxFramesPerSecond = configuration?.maxFramesPerSecond ?? 0

  if (!configuration?.enable || maxFramesPerSecond === 0) {
    return { stop: noop }
  }

  let stopped = false
  const captureIntervalId = setInterval(captureDirtyCanvases, ONE_SECOND / maxFramesPerSecond)

  function captureDirtyCanvases() {
    const capturableCanvases = canvasManager.getCapturableCanvases()
    capturableCanvases.forEach((canvas) => {
      const nodeId = scope.nodeIds.get(canvas)
      if (nodeId === undefined) {
        canvasManager.markCanvas(canvas, CanvasStatus.Clean)
        return
      }

      const nodePrivacyLevel = getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel)
      if (nodePrivacyLevel !== NodePrivacyLevel.ALLOW) {
        return // Keep it dirty so it can be captured if its privacy level becomes allow
      }

      void canvasManager.capture(canvas, (attempt) => captureCanvas(canvas, nodeId, attempt))
    })
  }

  async function captureCanvas(canvas: HTMLCanvasElement, nodeId: NodeId, attempt: CanvasCaptureAttempt) {
    let snapshot: CanvasSnapshot | undefined
    try {
      snapshot = await createCanvasSnapshot(canvas, configuration?.maxImageDimension ?? 1000)
      if (stopped || !attempt.isCurrent()) {
        return
      }
      if (!snapshot) {
        return // snapshot failed; leave it dirty
      }

      const hash = await computeImageHash(snapshot, configuration?.hashingMaxDimension ?? 100)
      if (stopped || !attempt.isCurrent()) {
        return
      }
      if (hash === undefined) {
        return // hashing failed; leave it dirty
      }

      if (hash === attempt.lastChangeHash) {
        attempt.settle(hash)
        return // unchanged: no capture/output
      }

      const image = await captureCanvasImage(snapshot)
      if (stopped || !attempt.isCurrent()) {
        return
      }
      if (!image) {
        return // encoding failed; leave it dirty
      }

      onCanvasCapture({ nodeId, changeHash: hash, image })
      attempt.settle(hash)
    } catch (error) {
      if (!stopped) {
        attempt.fail(error)
      }
    } finally {
      snapshot?.close()
    }
  }

  return {
    stop: () => {
      stopped = true
      clearInterval(captureIntervalId)
    },
  }
}
