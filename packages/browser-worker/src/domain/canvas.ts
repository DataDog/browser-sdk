import type { CanvasCaptureAction, CanvasCaptureResponse } from '@datadog/browser-core'
import { globalObject, mockable } from '@datadog/js-core/util'

/**
 * Hashes a thumbnail of the canvas bitmap, and encodes the bitmap only if the hash changed. Doing
 * this in a worker keeps the pixel readback and the image encoding off the main thread.
 */
export async function captureCanvas(action: CanvasCaptureAction): Promise<CanvasCaptureResponse> {
  const { id, bitmap } = action
  try {
    const image = drawOnCanvas(bitmap, bitmap.width, bitmap.height)
    // The bitmap is already downscaled, so if it already fits, hash it directly instead of downscaling it again.
    const thumbnail =
      Math.max(bitmap.width, bitmap.height) <= action.hashingMaxDimension
        ? image
        : drawOnCanvas(image.canvas, ...getDownscaledSize(bitmap.width, bitmap.height, action.hashingMaxDimension))

    const pixels = thumbnail.getImageData(0, 0, thumbnail.canvas.width, thumbnail.canvas.height).data
    // The canvas dimensions are part of the hash, so a resize always counts as a change.
    const hash = `${action.canvasWidth}x${action.canvasHeight}-${await hashPixels(pixels)}`
    if (hash === action.lastChangeHash) {
      return { type: 'canvasUnchanged', id }
    }

    const blob = await image.canvas.convertToBlob({ type: 'image/webp', quality: action.encodeQuality })
    return { type: 'canvasCaptured', id, hash, image: blob }
  } catch (error) {
    return { type: 'canvasCaptureFailed', id, errorName: error instanceof Error ? error.name : undefined }
  } finally {
    bitmap.close()
  }
}

function getDownscaledSize(width: number, height: number, maxDimension: number): [number, number] {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

function drawOnCanvas(image: CanvasImageSource, width: number, height: number) {
  const context = new OffscreenCanvas(width, height).getContext('2d')
  if (!context) {
    throw new Error('2d context unavailable')
  }
  context.imageSmoothingQuality = 'low'
  context.drawImage(image, 0, 0, width, height)
  return context
}

function hashPixels(data: ImageData['data']): Promise<string> {
  // crypto.subtle is only exposed in secure contexts, so it is missing on plain HTTP pages.
  const subtleCrypto = mockable(globalObject.crypto?.subtle)
  if (!subtleCrypto) {
    return Promise.resolve(fnv1aHash(data))
  }
  return subtleCrypto.digest('SHA-256', data).then(arrayBufferToHex, () => fnv1aHash(data))
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
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
