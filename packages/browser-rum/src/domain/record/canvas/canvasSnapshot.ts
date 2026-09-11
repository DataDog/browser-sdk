export interface CanvasSnapshot {
  canvasHeight: number
  canvasWidth: number
  source: HTMLCanvasElement
}

export function createCanvasSnapshot(canvas: HTMLCanvasElement, maxImageDimension: number): CanvasSnapshot | undefined {
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const source = createDownscaledCanvas(canvas, canvasWidth, canvasHeight, maxImageDimension)
  if (!source) {
    return undefined
  }

  return { canvasHeight, canvasWidth, source }
}

// Downscales `image` (of size `width`x`height`) to fit within `maxDimension` on a fresh canvas.
export function createDownscaledCanvas(
  image: CanvasImageSource,
  width: number,
  height: number,
  maxDimension: number
): HTMLCanvasElement | undefined {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  const scaledWidth = Math.max(1, Math.round(width * scale))
  const scaledHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = scaledWidth
  canvas.height = scaledHeight

  const context = canvas.getContext('2d')
  if (!context) {
    return undefined
  }

  context.imageSmoothingQuality = 'low'
  context.drawImage(image, 0, 0, scaledWidth, scaledHeight)

  return canvas
}

export function captureCanvasImage(snapshot: CanvasSnapshot, encodeQuality: number): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    try {
      snapshot.source.toBlob((blob) => resolve(blob ?? undefined), 'image/webp', encodeQuality)
    } catch {
      resolve(undefined)
    }
  })
}
