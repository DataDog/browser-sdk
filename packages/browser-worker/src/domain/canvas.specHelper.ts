import type { CanvasCaptureAction } from '@datadog/browser-core'

// Creates a 'captureCanvas' action with a 2x2 bitmap filled with `color`
export function createAction(color: string, overrides: Partial<CanvasCaptureAction> = {}): CanvasCaptureAction {
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
