import type { CanvasSnapshotImage } from '@datadog/browser-core'

export type CanvasSnapshot = {
  canvasHeight: number
  canvasWidth: number
} & CanvasSnapshotImage

export type BitmapCanvasSnapshot = CanvasSnapshot & { bitmap: ImageBitmap }

export function createCanvasSnapshot(
  canvas: HTMLCanvasElement,
  maxImageDimension: number
): BitmapCanvasSnapshot | undefined {
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const bitmap = createDownscaledBitmap(canvas, canvasWidth, canvasHeight, maxImageDimension)
  if (!bitmap) {
    return undefined
  }

  return { canvasHeight, canvasWidth, bitmap }
}

// Transferring a snapshot to the worker detaches it, so a snapshot that must be kept is copied first.
export function copyCanvasSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot | undefined {
  if ('pixels' in snapshot) {
    return { ...snapshot, pixels: { ...snapshot.pixels, data: snapshot.pixels.data.slice(0) } }
  }
  const { width, height } = snapshot.bitmap
  const bitmap = createDownscaledBitmap(snapshot.bitmap, width, height, Math.max(width, height))
  if (!bitmap) {
    return undefined
  }

  return { ...snapshot, bitmap }
}

export function closeCanvasSnapshot(snapshot: CanvasSnapshot) {
  if ('bitmap' in snapshot) {
    snapshot.bitmap.close()
  }
}

// Downscales `image` (of size `width`x`height`) to fit within `maxDimension`. Drawing it synchronously
// keeps the pixels of a WebGL canvas before its drawing buffer is discarded.
function createDownscaledBitmap(
  image: CanvasImageSource,
  width: number,
  height: number,
  maxDimension: number
): ImageBitmap | undefined {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  const scaledWidth = Math.max(1, Math.round(width * scale))
  const scaledHeight = Math.max(1, Math.round(height * scale))

  const context = new OffscreenCanvas(scaledWidth, scaledHeight).getContext('2d')
  if (!context) {
    return undefined
  }

  context.imageSmoothingQuality = 'low'
  context.drawImage(image, 0, 0, scaledWidth, scaledHeight)

  return context.canvas.transferToImageBitmap()
}
