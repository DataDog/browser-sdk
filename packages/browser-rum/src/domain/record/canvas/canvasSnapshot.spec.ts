import { registerCleanupTask } from '@datadog/browser-core/test'
import { skipIfOffscreenCanvasIsNotSupported } from '../../../../test'
import type { CanvasSnapshot } from './canvasSnapshot'
import { copyCanvasSnapshot, createCanvasSnapshot } from './canvasSnapshot'
import { bitmapPixels } from './canvasImage.specHelper'

describe('createCanvasSnapshot', () => {
  beforeEach(() => {
    skipIfOffscreenCanvasIsNotSupported()
  })

  it('downscales the snapshot to the configured maximum dimension', () => {
    const snapshot = createSnapshot(createCanvas(4, 2), 2)

    expect([snapshot.bitmap.width, snapshot.bitmap.height]).toEqual([2, 1])
  })

  it('does not upscale a canvas smaller than the maximum dimension', () => {
    const snapshot = createSnapshot(createCanvas(2, 2), 1000)

    expect([snapshot.bitmap.width, snapshot.bitmap.height]).toEqual([2, 2])
  })

  it('keeps the dimensions of the canvas it was taken from', () => {
    const snapshot = createSnapshot(createCanvas(4, 2), 1)

    expect([snapshot.canvasWidth, snapshot.canvasHeight]).toEqual([4, 2])
  })

  it('does not take a snapshot when no 2d context is available', () => {
    const canvas = createCanvas(2, 2)
    spyOn(OffscreenCanvas.prototype, 'getContext').and.returnValue(null)

    expect(createCanvasSnapshot(canvas, 1000)).toBeUndefined()
  })

  it('is not affected by later draws on the canvas', () => {
    const canvas = createCanvas(1, 1, ['red'])
    const snapshot = createSnapshot(canvas, 1000)

    fill(canvas, 'blue')

    expect(bitmapPixels(snapshot.bitmap)).toEqual([255, 0, 0, 255])
  })

  it('downscales the whole canvas instead of cropping it', () => {
    const pixels = bitmapPixels(createSnapshot(createCanvas(4, 2, ['red', 'blue']), 2).bitmap)

    // First pixel: red dominates over blue.
    expect(pixels[0]).toBeGreaterThan(pixels[2])
    // Second pixel: blue dominates over red.
    expect(pixels[6]).toBeGreaterThan(pixels[4])
  })
})

describe('copyCanvasSnapshot', () => {
  beforeEach(() => {
    skipIfOffscreenCanvasIsNotSupported()
  })

  it('copies the pixels and the canvas dimensions into a new bitmap', () => {
    const snapshot = createSnapshot(createCanvas(4, 2, ['red']), 2)

    const copy = copyCanvasSnapshot(snapshot)!

    expect(copy.bitmap).not.toBe(snapshot.bitmap)
    expect([copy.canvasWidth, copy.canvasHeight]).toEqual([4, 2])
    expect(bitmapPixels(copy.bitmap)).toEqual(bitmapPixels(snapshot.bitmap))
  })
})

function createCanvas(width: number, height: number, colors: string[] = ['red']): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const stripeWidth = width / colors.length
  colors.forEach((color, index) => {
    context.fillStyle = color
    context.fillRect(index * stripeWidth, 0, stripeWidth, height)
  })
  document.body.appendChild(canvas)
  registerCleanupTask(() => canvas.remove())
  return canvas
}

function fill(canvas: HTMLCanvasElement, color: string) {
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, canvas.width, canvas.height)
}

function createSnapshot(canvas: HTMLCanvasElement, maxImageDimension: number): CanvasSnapshot {
  return createCanvasSnapshot(canvas, maxImageDimension)!
}
