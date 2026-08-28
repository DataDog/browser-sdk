import { clearInterval, mockable, noop, setInterval } from '@datadog/browser-core'
import { getNodePrivacyLevel, NodePrivacyLevel } from '@datadog/browser-rum-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import type { RecordingScope } from '../recordingScope'
import type { NodeId } from '../encoding'
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

      const canReadCanvas = () =>
        scope.nodeIds.get(canvas) === nodeId &&
        getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel) === NodePrivacyLevel.ALLOW

      let snapshotPromise: Promise<CanvasSnapshot | undefined>
      try {
        snapshotPromise = createCanvasSnapshot(canvas, configuration?.maxImageDimension ?? 1000, canReadCanvas)
      } catch (error) {
        if (isSecurityError(error)) {
          canvasManager.markCanvasTainted(canvas)
        }
        canvasManager.markCanvasCaptureFinished(canvas, captureId)
        return
      }

      snapshotPromise
        .then((snapshot) => {
          if (stopped || !canvasManager.isCanvasCaptureInFlight(canvas, captureId)) {
            snapshot?.close()
            return
          }

          if (!snapshot) {
            return // snapshot failed; leave it dirty
          }

          if (scope.nodeIds.get(canvas) !== nodeId) {
            snapshot.close()
            return // The canvas is no longer represented by the node that this capture started for
          }

          let hashPromise: Promise<string | undefined>
          try {
            hashPromise = computeImageHash(snapshot, configuration?.hashingMaxDimension ?? 100)
          } catch (error) {
            snapshot.close()
            if (isSecurityError(error)) {
              canvasManager.markCanvasTainted(canvas)
            }
            return
          }

          return hashPromise
            .then((hash) => {
              if (stopped || !canvasManager.isCanvasCaptureInFlight(canvas, captureId)) {
                return
              }

              if (hash === undefined) {
                return // hashing failed; leave it dirty
              }

              if (scope.nodeIds.get(canvas) !== nodeId) {
                return // The canvas is no longer represented by the node that this capture started for
              }

              if (hash === canvasManager.getPreviousHash(canvas)) {
                canvasManager.markCanvasCleanIfUnchanged(canvas, captureId)
                return // unchanged: no capture/output
              }

              // Clear the dirty state before the asynchronous encoding. A draw occurring while the
              // capture is in flight will mark the canvas dirty again and will be handled by the next tick.
              canvasManager.markCanvasCleanIfUnchanged(canvas, captureId)

              return captureCanvasImage(snapshot).then((image) => {
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
            .finally(() => snapshot.close())
        })
        .catch((error) => {
          if (!stopped && canvasManager.isCanvasCaptureInFlight(canvas, captureId)) {
            if (isSecurityError(error)) {
              canvasManager.markCanvasTainted(canvas)
            } else {
              canvasManager.markCanvasDirty(canvas)
            }
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

interface CanvasSnapshot {
  canvasHeight: number
  canvasWidth: number
  close: () => void
  height: number
  source: CanvasImageSource
  width: number
}

function createCanvasSnapshot(
  canvas: HTMLCanvasElement,
  maxImageDimension: number,
  canReadCanvas: () => boolean
): Promise<CanvasSnapshot | undefined> {
  if (!canReadCanvas()) {
    return Promise.resolve(undefined)
  }

  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const scale = Math.min(1, maxImageDimension / Math.max(canvasWidth, canvasHeight))
  const width = Math.max(1, Math.round(canvasWidth * scale))
  const height = Math.max(1, Math.round(canvasHeight * scale))
  const createImageBitmap = mockable(globalObject.createImageBitmap)

  if (!createImageBitmap) {
    return Promise.resolve(
      createCanvasSnapshotWithCanvas(canvas, canvasWidth, canvasHeight, width, height, canReadCanvas)
    )
  }

  try {
    return createImageBitmap(canvas, {
      resizeHeight: height,
      resizeQuality: 'low',
      resizeWidth: width,
    }).then(
      (imageBitmap) => ({
        canvasHeight,
        canvasWidth,
        close: () => imageBitmap.close(),
        height,
        source: imageBitmap,
        width,
      }),
      () => createCanvasSnapshotWithCanvas(canvas, canvasWidth, canvasHeight, width, height, canReadCanvas)
    )
  } catch {
    return Promise.resolve(
      createCanvasSnapshotWithCanvas(canvas, canvasWidth, canvasHeight, width, height, canReadCanvas)
    )
  }
}

function createCanvasSnapshotWithCanvas(
  canvas: HTMLCanvasElement,
  canvasWidth: number,
  canvasHeight: number,
  width: number,
  height: number,
  canReadCanvas: () => boolean
): CanvasSnapshot | undefined {
  if (!canReadCanvas()) {
    return undefined
  }

  const snapshotCanvas = document.createElement('canvas')
  snapshotCanvas.width = width
  snapshotCanvas.height = height

  const context = snapshotCanvas.getContext('2d')
  if (!context) {
    return undefined
  }

  context.imageSmoothingQuality = 'low'
  context.drawImage(canvas, 0, 0, width, height)

  return { canvasHeight, canvasWidth, close: noop, height, source: snapshotCanvas, width }
}

function computeImageHash(snapshot: CanvasSnapshot, maxHashDimension: number): Promise<string | undefined> {
  const scale = Math.min(1, maxHashDimension / Math.max(snapshot.width, snapshot.height))
  const width = Math.max(1, Math.round(snapshot.width * scale))
  const height = Math.max(1, Math.round(snapshot.height * scale))

  const thumbnail = document.createElement('canvas')
  thumbnail.width = width
  thumbnail.height = height

  const context = thumbnail.getContext('2d')
  if (!context) {
    return Promise.resolve(undefined)
  }
  context.imageSmoothingQuality = 'low'
  context.drawImage(snapshot.source, 0, 0, width, height)

  const data = context.getImageData(0, 0, width, height).data
  const subtleCrypto = mockable(globalObject.crypto?.subtle)
  if (!subtleCrypto) {
    return Promise.resolve(createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, fnv1aHash(data)))
  }

  return subtleCrypto.digest('SHA-256', data).then(
    (buffer) => createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, arrayBufferToHex(buffer)),
    () => createChangeHash(snapshot.canvasWidth, snapshot.canvasHeight, fnv1aHash(data))
  )
}

function captureCanvasImage(snapshot: CanvasSnapshot): Promise<Blob | undefined> {
  const imageCanvas = document.createElement('canvas')
  imageCanvas.width = snapshot.width
  imageCanvas.height = snapshot.height

  const context = imageCanvas.getContext('2d')
  if (!context) {
    return Promise.resolve(undefined)
  }

  try {
    context.drawImage(snapshot.source, 0, 0)
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
