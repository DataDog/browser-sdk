import { clearInterval, setInterval } from '@datadog/browser-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import type { Tracker } from '../trackers'
import type { CanvasManager } from './canvasManager'

export interface CanvasCaptureConfiguration {
  imageFormat: 'image/png' | 'image/webp'
  maxCaptureDimension: number
  maxFramesPerSecond: number
  maxHashDimension: number
}

export interface CapturedCanvasImage {
  blob: Blob
  canvas: HTMLCanvasElement
  hash: string
}

export type ComputeCanvasImageHash = (canvas: HTMLCanvasElement, maxHashDimension: number) => string | undefined
export type ComputeCanvasBlobHash = (blob: Blob) => Promise<string>
export type EmitCanvasImage = (image: CapturedCanvasImage) => void

export function startCanvasCapture(
  canvasManager: CanvasManager,
  configuration: CanvasCaptureConfiguration,
  emitCanvasImage: EmitCanvasImage,
  computeImageHash: ComputeCanvasImageHash = computeCanvasImageHash,
  computeBlobHash: ComputeCanvasBlobHash = computeCanvasBlobHash
): Tracker {
  if (configuration.maxFramesPerSecond === 0) {
    return { stop: () => canvasManager.clearDirtyCanvases() }
  }

  const canvasesBeingCaptured = new WeakSet<HTMLCanvasElement>()
  const lastCanvasHash = new WeakMap<HTMLCanvasElement, string>()
  let stopped = false

  const captureIntervalId = setInterval(captureDirtyCanvases, ONE_SECOND / configuration.maxFramesPerSecond)

  function captureDirtyCanvases() {
    canvasManager.getDirtyCanvases().forEach((canvas) => {
      if (canvasesBeingCaptured.has(canvas)) {
        return
      }

      canvasManager.markCanvasClean(canvas)

      let hash: string | undefined
      try {
        hash = computeImageHash(canvas, configuration.maxHashDimension)
      } catch {
        hash = undefined
      }

      if (hash !== undefined && lastCanvasHash.get(canvas) === hash) {
        return
      }

      canvasesBeingCaptured.add(canvas)

      try {
        captureCanvasImage(canvas, configuration.maxCaptureDimension, configuration.imageFormat, (blob) => {
          if (stopped || !blob) {
            canvasesBeingCaptured.delete(canvas)
            return
          }

          if (hash !== undefined) {
            finishCapture(canvas, blob, hash)
            return
          }

          void computeBlobHash(blob)
            .then((blobHash) => finishCapture(canvas, blob, blobHash))
            .catch(() => canvasesBeingCaptured.delete(canvas))
        })
      } catch {
        canvasesBeingCaptured.delete(canvas)
      }
    })
  }

  function finishCapture(canvas: HTMLCanvasElement, blob: Blob, hash: string) {
    canvasesBeingCaptured.delete(canvas)

    if (stopped || lastCanvasHash.get(canvas) === hash) {
      return
    }

    lastCanvasHash.set(canvas, hash)
    emitCanvasImage({ blob, canvas, hash })
  }

  return {
    stop: () => {
      stopped = true
      clearInterval(captureIntervalId)
      canvasManager.clearDirtyCanvases()
    },
  }
}

/**
 * Downscales a canvas to a greyscale thumbnail and computes a fast, non-cryptographic hash of its pixels.
 */
export function computeCanvasImageHash(canvas: HTMLCanvasElement, maxHashDimension: number): string | undefined {
  const { width, height } = getScaledDimensions(canvas, maxHashDimension)
  const thumbnail = document.createElement('canvas')
  thumbnail.width = width
  thumbnail.height = height

  const context = thumbnail.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return undefined
  }

  try {
    context.filter = 'grayscale(1)'
    context.drawImage(canvas, 0, 0, width, height)
    return fnv1aHash(context.getImageData(0, 0, width, height).data)
  } catch {
    return undefined
  }
}

export function captureCanvasImage(
  canvas: HTMLCanvasElement,
  maxCaptureDimension: number,
  imageFormat: CanvasCaptureConfiguration['imageFormat'],
  callback: BlobCallback
): void {
  const dimensions = getScaledDimensions(canvas, maxCaptureDimension)
  if (dimensions.width === canvas.width && dimensions.height === canvas.height) {
    canvas.toBlob(callback, imageFormat)
    return
  }

  const scaledCanvas = document.createElement('canvas')
  scaledCanvas.width = dimensions.width
  scaledCanvas.height = dimensions.height
  const context = scaledCanvas.getContext('2d')

  if (!context) {
    callback(null)
    return
  }

  context.drawImage(canvas, 0, 0, dimensions.width, dimensions.height)
  scaledCanvas.toBlob(callback, imageFormat)
}

export async function computeCanvasBlobHash(blob: Blob): Promise<string> {
  return fnv1aHash(new Uint8Array(await readBlobAsArrayBuffer(blob)))
}

function getScaledDimensions(canvas: HTMLCanvasElement, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(canvas.width, canvas.height))

  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  }
}

// FNV-1a is defined in terms of 32-bit XOR and unsigned conversion.
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

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error || new Error('Unable to read canvas image'))
    reader.readAsArrayBuffer(blob)
  })
}
