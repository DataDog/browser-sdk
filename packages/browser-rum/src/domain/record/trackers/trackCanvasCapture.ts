import { clearInterval, globalObject, mockable, noop, setInterval } from '@datadog/browser-core'
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

  let stopped = false
  const captureIntervalId = setInterval(captureDirtyCanvases, ONE_SECOND / maxFramesPerSecond)

  function captureDirtyCanvases() {
    const capturableCanvases = canvasManager.getCapturableCanvases()
    capturableCanvases.forEach((canvas) => {
      const nodeId = scope.nodeIds.get(canvas)
      if (nodeId === undefined) {
        canvasManager.markCanvasClean(canvas)
        return
      }

      const nodePrivacyLevel = getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel)
      if (nodePrivacyLevel !== NodePrivacyLevel.ALLOW) {
        return // Keep it dirty so it can be captured if its privacy level becomes allow
      }

      const captureId = canvasManager.markCanvasCaptureStarted(canvas)
      if (captureId === undefined) {
        return
      }

      let hashPromise: Promise<string | undefined>
      try {
        hashPromise = computeImageHash(canvas, configuration?.hashingMaxDimension ?? 100)
      } catch (error) {
        if (isSecurityError(error)) {
          canvasManager.markCanvasTainted(canvas)
        }
        canvasManager.markCanvasCaptureFinished(canvas, captureId)
        return
      }

      hashPromise
        .then((hash) => {
          if (stopped || !canvasManager.isCanvasCaptureInFlight(canvas, captureId)) {
            return
          }

          if (hash === undefined) {
            return // capture failed; leave it dirty
          }

          if (scope.nodeIds.get(canvas) !== nodeId) {
            return // The canvas is no longer represented by the node that this capture started for
          }

          const currentNodePrivacyLevel = getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel)
          if (currentNodePrivacyLevel !== NodePrivacyLevel.ALLOW) {
            return // Do not snapshot pixels if the canvas became masked while hashing
          }

          if (hash === canvasManager.getPreviousHash(canvas)) {
            canvasManager.markCanvasCleanIfUnchanged(canvas, captureId)
            return // unchanged: no capture/output; thumbnail is discarded naturally
          }

          // Clear the dirty state before the asynchronous capture. A draw occurring while the
          // capture is in flight will mark the canvas dirty again and will be handled by the next tick.
          canvasManager.markCanvasCleanIfUnchanged(canvas, captureId)

          return captureCanvasImage(
            canvas,
            configuration?.maxImageDimension ?? 1000,
            () =>
              scope.nodeIds.get(canvas) === nodeId &&
              getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel) === NodePrivacyLevel.ALLOW
          ).then((image) => {
            if (
              stopped ||
              !canvasManager.isCanvasCaptureInFlight(canvas, captureId) ||
              scope.nodeIds.get(canvas) !== nodeId
            ) {
              return
            }

            if (!image) {
              canvasManager.markCanvasDirty(canvas)
              return
            }

            onCanvasCapture({ nodeId, changeHash: hash, image })
            if (canvasManager.isCanvasCaptureInFlight(canvas, captureId)) {
              canvasManager.setPreviousHash(canvas, hash)
            }
          })
        })
        .catch(() => {
          // Leave the canvas dirty so it can be retried on the next interval.
          if (!stopped && canvasManager.isCanvasCaptureInFlight(canvas, captureId)) {
            canvasManager.markCanvasDirty(canvas)
          }
        })
        .finally(() => {
          canvasManager.markCanvasCaptureFinished(canvas, captureId)
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

function computeImageHash(canvas: HTMLCanvasElement, maxHashDimension: number): Promise<string | undefined> {
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const scale = Math.min(1, maxHashDimension / Math.max(canvasWidth, canvasHeight))
  const width = Math.max(1, Math.round(canvasWidth * scale))
  const height = Math.max(1, Math.round(canvasHeight * scale))

  const thumbnail = document.createElement('canvas')
  thumbnail.width = width
  thumbnail.height = height

  const context = thumbnail.getContext('2d')
  if (!context) {
    return Promise.resolve(undefined)
  }
  context.imageSmoothingQuality = 'low'
  context.drawImage(canvas, 0, 0, width, height)

  const data = context.getImageData(0, 0, width, height).data
  const subtleCrypto = mockable(globalObject.crypto?.subtle)
  if (!subtleCrypto) {
    return Promise.resolve(createChangeHash(canvasWidth, canvasHeight, fnv1aHash(data)))
  }

  return subtleCrypto.digest('SHA-256', data).then(
    (buffer) => createChangeHash(canvasWidth, canvasHeight, arrayBufferToHex(buffer)),
    () => createChangeHash(canvasWidth, canvasHeight, fnv1aHash(data))
  )
}

function captureCanvasImage(
  canvas: HTMLCanvasElement,
  maxImageDimension: number,
  canReadCanvas: () => boolean
): Promise<Blob | undefined> {
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

  const createImageBitmap = mockable(globalObject.createImageBitmap)
  if (!createImageBitmap) {
    return drawCanvasToBlob(canvas, context, imageCanvas, width, height, canReadCanvas)
  }

  try {
    return createImageBitmap(canvas, {
      resizeHeight: height,
      resizeQuality: 'low',
      resizeWidth: width,
    }).then(
      (imageBitmap) => {
        try {
          context.drawImage(imageBitmap, 0, 0)
        } finally {
          imageBitmap.close()
        }

        return canvasToBlob(imageCanvas)
      },
      () => drawCanvasToBlob(canvas, context, imageCanvas, width, height, canReadCanvas)
    )
  } catch {
    return drawCanvasToBlob(canvas, context, imageCanvas, width, height, canReadCanvas)
  }
}

function drawCanvasToBlob(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  imageCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  canReadCanvas: () => boolean
): Promise<Blob | undefined> {
  if (!canReadCanvas()) {
    return Promise.resolve(undefined)
  }

  try {
    context.drawImage(canvas, 0, 0, width, height)
    return canvasToBlob(imageCanvas)
  } catch {
    return Promise.resolve(undefined)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png')
    } catch {
      resolve(undefined)
    }
  })
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function createChangeHash(width: number, height: number, pixelHash: string): string {
  return `${width}x${height}:${pixelHash}`
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

function isSecurityError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'SecurityError'
}
