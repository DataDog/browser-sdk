export interface CanvasSnapshot {
  canvasHeight: number
  canvasWidth: number
  bitmap: ImageBitmap
}

export function createCanvasSnapshot(canvas: HTMLCanvasElement, maxImageDimension: number): CanvasSnapshot | undefined {
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const bitmap = createDownscaledBitmap(canvas, canvasWidth, canvasHeight, maxImageDimension)
  if (!bitmap) {
    return undefined
  }

  return { canvasHeight, canvasWidth, bitmap }
}

// Transferring a bitmap to the worker detaches it, so a snapshot that must be kept is copied first.
export function copyCanvasSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot | undefined {
  const { width, height } = snapshot.bitmap
  const bitmap = createDownscaledBitmap(snapshot.bitmap, width, height, Math.max(width, height))
  if (!bitmap) {
    return undefined
  }

  return { ...snapshot, bitmap }
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
