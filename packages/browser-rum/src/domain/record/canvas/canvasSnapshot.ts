export interface CanvasSnapshot {
  canvasHeight: number
  canvasWidth: number
  source: HTMLCanvasElement
}

export function createCanvasSnapshot(canvas: HTMLCanvasElement, maxImageDimension: number): CanvasSnapshot | undefined {
  const canvasWidth = canvas.width
  const canvasHeight = canvas.height
  const scale = Math.min(1, maxImageDimension / Math.max(canvasWidth, canvasHeight))
  const width = Math.max(1, Math.round(canvasWidth * scale))
  const height = Math.max(1, Math.round(canvasHeight * scale))

  const source = document.createElement('canvas')
  source.width = width
  source.height = height

  const context = source.getContext('2d')
  if (!context) {
    return undefined
  }

  context.imageSmoothingQuality = 'low'
  context.drawImage(canvas, 0, 0, width, height)

  return { canvasHeight, canvasWidth, source }
}

export function captureCanvasImage(snapshot: CanvasSnapshot): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    try {
      snapshot.source.toBlob((blob) => resolve(blob ?? undefined), 'image/png')
    } catch {
      resolve(undefined)
    }
  })
}
