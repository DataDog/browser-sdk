import { registerCleanupTask } from '@datadog/browser-core/test'
import { globalObject } from '@datadog/js-core/util'
import type { CanvasSnapshot } from './canvasSnapshot'
import { captureCanvasImage, createCanvasSnapshot } from './canvasSnapshot'

describe('createCanvasSnapshot', () => {
  it('downscales the snapshot to the configured maximum dimension', async () => {
    const canvas = createCanvas(4, 2)

    const snapshot = await createSnapshot(canvas, 2)

    expect(snapshot.width).toBe(2)
    expect(snapshot.height).toBe(1)
  })

  it('does not upscale a canvas smaller than the maximum dimension', async () => {
    const canvas = createCanvas(2, 2)

    const snapshot = await createSnapshot(canvas, 1000)

    expect(snapshot.width).toBe(2)
    expect(snapshot.height).toBe(2)
  })

  it('keeps the dimensions of the canvas it was taken from', async () => {
    const canvas = createCanvas(4, 2)

    const snapshot = await createSnapshot(canvas, 1)

    expect(snapshot.canvasWidth).toBe(4)
    expect(snapshot.canvasHeight).toBe(2)
  })

  it('uses createImageBitmap with the resize options when available', async () => {
    if (!globalObject.createImageBitmap) {
      return
    }
    const createImageBitmapSpy = spyOn(globalObject, 'createImageBitmap').and.callThrough()
    const canvas = createCanvas(2, 2)

    await createSnapshot(canvas, 1)

    expect(createImageBitmapSpy.calls.count()).toBe(1)
    expect(createImageBitmapSpy.calls.argsFor(0)).toEqual([
      canvas,
      {
        resizeHeight: 1,
        resizeQuality: 'low',
        resizeWidth: 1,
      },
    ])
  })

  // TODO revisit fallback. Moved here from trackCanvasCapture.spec.ts and commented out along with
  // the createImageBitmap fallback in canvasSnapshot.ts.
  // it('falls back to drawing the canvas when createImageBitmap is unavailable', async () => {
  //   replaceMockable<typeof globalObject.createImageBitmap | undefined>(globalObject.createImageBitmap, undefined)
  //   const canvas = createCanvas(2, 2)
  //
  //   const snapshot = await createSnapshot(canvas, 1)
  //
  //   expect(snapshot.width).toBe(1)
  // })
  //
  // it('falls back to drawing the canvas when createImageBitmap rejects', async () => {
  //   replaceMockable(globalObject.createImageBitmap, () => Promise.reject(new Error('unsupported')))
  //   const canvas = createCanvas(2, 2)
  //
  //   const snapshot = await createSnapshot(canvas, 1)
  //
  //   expect(snapshot.width).toBe(1)
  // })
})

describe('captureCanvasImage', () => {
  it('encodes the snapshot as a PNG image', async () => {
    const canvas = createCanvas(2, 2)
    const snapshot = await createSnapshot(canvas, 1000)

    const image = await captureCanvasImage(snapshot)

    expect(image?.type).toBe('image/png')
  })

  it('encodes an image with the dimensions of the snapshot', async () => {
    const canvas = createCanvas(4, 2)
    const snapshot = await createSnapshot(canvas, 2)

    const image = await captureCanvasImage(snapshot)

    expect(await imageSize(image!)).toEqual([2, 1])
  })

  it('downscales the whole canvas instead of cropping it', async () => {
    // The canvas is red on its left half and blue on its right half, so a cropped image would be
    // fully red. Drawing a snapshot whose bitmap was not resized produces exactly that.
    const canvas = createCanvas(4, 2, ['red', 'blue'])
    const snapshot = await createSnapshot(canvas, 2)

    const image = await captureCanvasImage(snapshot)

    expect(await imagePixels(image!)).toEqual([255, 0, 0, 255, 0, 0, 255, 255])
  })

  it('does not encode an image when the canvas cannot receive the snapshot', async () => {
    const canvas = createCanvas(2, 2)
    const snapshot = await createSnapshot(canvas, 1000)
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null)

    expect(await captureCanvasImage(snapshot)).toBeUndefined()
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

async function createSnapshot(canvas: HTMLCanvasElement, maxImageDimension: number): Promise<CanvasSnapshot> {
  const snapshot = await createCanvasSnapshot(canvas, maxImageDimension)
  registerCleanupTask(() => snapshot?.close())
  return snapshot!
}

async function decodeImage(image: Blob): Promise<{ pixels: number[]; size: [number, number] }> {
  const bitmap = await createImageBitmap(image)
  const width = bitmap.width
  const height = bitmap.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  const pixels = Array.from(context.getImageData(0, 0, width, height).data)
  bitmap.close()
  return { pixels, size: [width, height] }
}

async function imageSize(image: Blob): Promise<[number, number]> {
  return (await decodeImage(image)).size
}

async function imagePixels(image: Blob): Promise<number[]> {
  return (await decodeImage(image)).pixels
}
