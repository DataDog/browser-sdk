import { clearInterval, setInterval } from '@datadog/browser-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import type { Tracker } from '../trackers'
import type { CanvasManager } from './canvasManager'

export interface CapturedCanvasImage {
  blob: Blob
  canvas: HTMLCanvasElement
  hash: string
}

export type ComputeCanvasImageHash = (blob: Blob) => Promise<string>
export type EmitCanvasImage = (image: CapturedCanvasImage) => void

export function startCanvasCapture(
  canvasManager: CanvasManager,
  maxFramesPerSecond: number,
  emitCanvasImage: EmitCanvasImage,
  computeImageHash: ComputeCanvasImageHash = computeCanvasImageHash
): Tracker {
  const canvasesBeingCaptured = new WeakSet<HTMLCanvasElement>()
  const lastCanvasHash = new WeakMap<HTMLCanvasElement, string>()
  let stopped = false

  const captureIntervalId = setInterval(captureDirtyCanvases, ONE_SECOND / maxFramesPerSecond)

  function captureDirtyCanvases() {
    canvasManager.getDirtyCanvases().forEach((canvas) => {
      if (canvasesBeingCaptured.has(canvas)) {
        return
      }

      canvasManager.markCanvasClean(canvas)
      canvasesBeingCaptured.add(canvas)

      try {
        canvas.toBlob((blob) => {
          if (stopped || !blob) {
            canvasesBeingCaptured.delete(canvas)
            return
          }

          void computeImageHash(blob)
            .then((hash) => {
              canvasesBeingCaptured.delete(canvas)

              if (stopped || lastCanvasHash.get(canvas) === hash) {
                return
              }

              lastCanvasHash.set(canvas, hash)
              emitCanvasImage({ blob, canvas, hash })
            })
            .catch(() => canvasesBeingCaptured.delete(canvas))
        }, 'image/png')
      } catch {
        canvasesBeingCaptured.delete(canvas)
      }
    })
  }

  return {
    stop: () => {
      stopped = true
      clearInterval(captureIntervalId)
      canvasManager.clearDirtyCanvases()
    },
  }
}

export async function computeCanvasImageHash(blob: Blob): Promise<string> {
  const imageBytes = await readBlobAsArrayBuffer(blob)
  const digest = await crypto.subtle.digest('SHA-256', imageBytes)

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

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
