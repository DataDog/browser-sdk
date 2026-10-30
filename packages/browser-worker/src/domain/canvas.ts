import type { CanvasCaptureAction, CanvasCaptureResponse, CanvasPixels } from '@datadog/browser-core'
import { globalObject, mockable } from '@datadog/js-core/util'

/**
 * Hashes a thumbnail of the canvas snapshot, and encodes the snapshot only if the hash changed. Doing
 * this in a worker keeps the pixel readback and the image encoding off the main thread.
 */
export async function captureCanvas(action: CanvasCaptureAction): Promise<CanvasCaptureResponse> {
  const { id } = action
  try {
    const image =
      'bitmap' in action
        ? drawOnCanvas(action.bitmap, action.bitmap.width, action.bitmap.height)
        : drawPixels(action.pixels)
    const { width, height } = image.canvas
    // The image is already downscaled, so if it already fits, hash it directly instead of downscaling it again.
    const thumbnail =
      Math.max(width, height) <= action.hashingMaxDimension
        ? image
        : drawOnCanvas(image.canvas, ...getDownscaledSize(width, height, action.hashingMaxDimension))

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
    if ('bitmap' in action) {
      action.bitmap.close()
    }
  }
}

// Draws WebGPU texture pixels, downscaled to fit within `maxImageDimension`
function drawPixels({ data, width, height, bytesPerRow, format, alphaMode, maxImageDimension }: CanvasPixels) {
  const source = new Uint8Array(data)
  const imageData = new ImageData(width, height)
  const [redOffset, blueOffset] = format === 'bgra8unorm' ? [2, 0] : [0, 2]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = y * bytesPerRow + x * 4
      const to = (y * width + x) * 4
      // An opaque canvas ignores the texture alpha, and ImageData colors are not premultiplied
      const alpha = alphaMode === 'opaque' ? 255 : source[from + 3]
      const scale = alphaMode === 'premultiplied' && alpha > 0 ? 255 / alpha : 1
      imageData.data[to] = source[from + redOffset] * scale
      imageData.data[to + 1] = source[from + 1] * scale
      imageData.data[to + 2] = source[from + blueOffset] * scale
      imageData.data[to + 3] = alpha
    }
  }

  const context = createContext(width, height)
  context.putImageData(imageData, 0, 0)
  return drawOnCanvas(context.canvas, ...getDownscaledSize(width, height, maxImageDimension))
}

function getDownscaledSize(width: number, height: number, maxDimension: number): [number, number] {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

function createContext(width: number, height: number) {
  const context = new OffscreenCanvas(width, height).getContext('2d')
  if (!context) {
    throw new Error('2d context unavailable')
  }
  return context
}

function drawOnCanvas(image: CanvasImageSource, width: number, height: number) {
  const context = createContext(width, height)
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
