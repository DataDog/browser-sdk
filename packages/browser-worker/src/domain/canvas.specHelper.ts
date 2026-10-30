import type { CanvasCaptureAction, CanvasPixels } from '@datadog/browser-core'

// Creates a 'captureCanvas' action with a 2x2 bitmap filled with `color`
export function createAction(
  color: string,
  overrides: Partial<CanvasCaptureAction> = {}
): CanvasCaptureAction & { bitmap: ImageBitmap } {
  const canvas = new OffscreenCanvas(2, 2)
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, 2, 2)

  return {
    action: 'captureCanvas',
    id: 1,
    bitmap: canvas.transferToImageBitmap(),
    canvasWidth: 2,
    canvasHeight: 2,
    lastChangeHash: undefined,
    hashingMaxDimension: 100,
    encodeQuality: 0.5,
    ...overrides,
  }
}

// Creates a 'captureCanvas' action with WebGPU texture pixels filled with `pixel`, each row padded
// to `bytesPerRow` like a texture copy
export function createPixelsAction(
  pixel: number[],
  {
    width = 2,
    height = 2,
    bytesPerRow = 256,
    format = 'rgba8unorm',
    alphaMode = 'opaque',
    maxImageDimension = 1000,
  }: Partial<CanvasPixels> = {}
): CanvasCaptureAction {
  const data = new Uint8Array(bytesPerRow * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixel, y * bytesPerRow + x * 4)
    }
  }

  return {
    action: 'captureCanvas',
    id: 1,
    pixels: { data: data.buffer, width, height, bytesPerRow, format, alphaMode, maxImageDimension },
    canvasWidth: width,
    canvasHeight: height,
    lastChangeHash: undefined,
    hashingMaxDimension: 100,
    encodeQuality: 0.5,
  }
}
