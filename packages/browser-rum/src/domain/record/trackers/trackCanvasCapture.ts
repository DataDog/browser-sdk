import { clearInterval, noop, setInterval } from '@datadog/browser-core'
import { getNodePrivacyLevel, NodePrivacyLevel } from '@datadog/browser-rum-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import type { NodeId } from '../itemIds'
import type { RecordingScope } from '../recordingScope'
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

  const previousHashes = new WeakMap<HTMLCanvasElement, string>()
  const inFlightCaptures = new WeakSet<HTMLCanvasElement>()
  let stopped = false
  const captureIntervalId = setInterval(captureDirtyCanvases, ONE_SECOND / maxFramesPerSecond)

  function captureDirtyCanvases() {
    const dirtyCanvases = canvasManager.getDirtyCanvases()
    dirtyCanvases.forEach((canvas) => {
      if (inFlightCaptures.has(canvas)) {
        return
      }

      const nodePrivacyLevel = getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel)
      if (nodePrivacyLevel !== NodePrivacyLevel.ALLOW) {
        canvasManager.markCanvasClean(canvas)
        return // Do not read pixels from privacy levels other than allow
      }

      let hash: string | undefined
      try {
        hash = computeImageHash(canvas, configuration?.hashingMaxDimension ?? 100)
      } catch {
        return // capture failed; leave it dirty
      }

      if (hash === undefined) {
        return // capture failed; leave it dirty
      }
      if (hash === previousHashes.get(canvas)) {
        canvasManager.markCanvasClean(canvas)
        return // unchanged: no capture/output; thumbnail is discarded naturally
      }

      const nodeId = scope.nodeIds.get(canvas)
      if (nodeId === undefined) {
        canvasManager.markCanvasClean(canvas)
        return
      }

      inFlightCaptures.add(canvas)
      // Clear the dirty state before the asynchronous capture. A draw occurring while the
      // capture is in flight will mark the canvas dirty again and will be handled by the next tick.
      canvasManager.markCanvasClean(canvas)

      captureCanvasImage(canvas, configuration?.maxImageDimension ?? 1000)
        .then((image) => {
          if (stopped) {
            return
          }

          if (!image) {
            canvasManager.markCanvasDirty(canvas)
            return
          }

          const currentNodePrivacyLevel = getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel)
          if (currentNodePrivacyLevel !== NodePrivacyLevel.ALLOW) {
            canvasManager.markCanvasClean(canvas)
            return // Do not emit pixels if the canvas became privacy level other than allow during capture
          }

          onCanvasCapture({ nodeId, changeHash: hash, image })
          previousHashes.set(canvas, hash)
        })
        .catch(() => {
          // Leave the canvas dirty so it can be retried on the next interval.
          if (!stopped) {
            canvasManager.markCanvasDirty(canvas)
          }
        })
        .finally(() => {
          inFlightCaptures.delete(canvas)
        })
    })
  }

  return {
    stop: () => {
      stopped = true
      clearInterval(captureIntervalId)
    },
  }
}

function computeImageHash(canvas: HTMLCanvasElement, maxHashDimension: number): string | undefined {
  const scale = Math.min(1, maxHashDimension / Math.max(canvas.width, canvas.height))
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))

  const thumbnail = document.createElement('canvas')
  thumbnail.width = width
  thumbnail.height = height

  const context = thumbnail.getContext('2d')
  if (!context) {
    return undefined
  }
  context.imageSmoothingQuality = 'low'
  context.filter = 'grayscale(1)'
  context.drawImage(canvas, 0, 0, width, height)

  return fnv1aHash(context.getImageData(0, 0, width, height).data)
}

function captureCanvasImage(canvas: HTMLCanvasElement, maxImageDimension: number): Promise<Blob | undefined> {
  const scale = Math.min(1, maxImageDimension / Math.max(canvas.width, canvas.height))
  const width = Math.max(1, Math.round(canvas.width * scale))
  const height = Math.max(1, Math.round(canvas.height * scale))

  const imageCanvas = document.createElement('canvas')
  imageCanvas.width = width
  imageCanvas.height = height

  const context = imageCanvas.getContext('2d')
  if (!context) {
    return Promise.resolve(undefined)
  }

  context.drawImage(canvas, 0, 0, width, height)

  return new Promise((resolve) => {
    try {
      imageCanvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png')
    } catch {
      resolve(undefined)
    }
  })
}

/* eslint-disable no-bitwise */
function fnv1aHash(data: ArrayLike<number>): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index]
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}
/* eslint-enable no-bitwise */
