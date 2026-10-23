import { globalObject, mockable } from '@datadog/js-core/util'

// Protocol between the main thread and the canvas worker, over the MessagePort sent with the
// 'startCanvasWorker' deflate worker action.
export interface CanvasCaptureRequest {
  action: 'capture'
  id: number
  /** Already downscaled to the recorded image dimensions. Transferred, and closed once captured. */
  bitmap: ImageBitmap
  canvasWidth: number
  canvasHeight: number
  lastChangeHash: string | undefined
  hashingMaxDimension: number
  encodeQuality: number
}

export type CanvasWorkerRequest = CanvasCaptureRequest | { action: 'stop' }

export type CanvasCaptureResponse =
  | { type: 'captured'; id: number; hash: string; image: Blob }
  // The hash matches `lastChangeHash`, so the image is not encoded
  | { type: 'unchanged'; id: number }
  | { type: 'failed'; id: number; errorName: string | undefined }

export type CanvasWorkerResponse = { type: 'ready' } | CanvasCaptureResponse

export function getDownscaledSize(width: number, height: number, maxDimension: number): [number, number] {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

/**
 * Hashes a canvas bitmap on a thumbnail, and encodes it only if the hash changed. Runs in the canvas worker.
 */
export async function captureCanvasBitmap(request: CanvasCaptureRequest): Promise<CanvasCaptureResponse> {
  const { id, bitmap } = request
  try {
    const image = drawOnCanvas(bitmap, bitmap.width, bitmap.height)
    // The bitmap is already downscaled, so if it already fits, hash it directly instead of downscaling it again.
    const thumbnail =
      Math.max(bitmap.width, bitmap.height) <= request.hashingMaxDimension
        ? image
        : drawOnCanvas(image.canvas, ...getDownscaledSize(bitmap.width, bitmap.height, request.hashingMaxDimension))

    const pixels = thumbnail.getImageData(0, 0, thumbnail.canvas.width, thumbnail.canvas.height).data
    // The canvas dimensions are part of the hash, so a resize always counts as a change.
    const hash = `${request.canvasWidth}x${request.canvasHeight}-${await hashPixels(pixels)}`
    if (hash === request.lastChangeHash) {
      return { type: 'unchanged', id }
    }

    const blob = await image.canvas.convertToBlob({ type: 'image/webp', quality: request.encodeQuality })
    return { type: 'captured', id, hash, image: blob }
  } catch (error) {
    return { type: 'failed', id, errorName: error instanceof Error ? error.name : undefined }
  } finally {
    bitmap.close()
  }
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
