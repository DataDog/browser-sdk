import { registerCleanupTask } from '@datadog/browser-core/test'
import type { CanvasSnapshot } from './canvasSnapshot'
import { captureCanvasImage, createCanvasSnapshot } from './canvasSnapshot'

describe('createCanvasSnapshot', () => {
  it('downscales the snapshot to the configured maximum dimension', () => {
    const snapshot = createSnapshot(createCanvas(4, 2), 2)

    expect([snapshot.source.width, snapshot.source.height]).toEqual([2, 1])
  })

  it('does not upscale a canvas smaller than the maximum dimension', () => {
    const snapshot = createSnapshot(createCanvas(2, 2), 1000)

    expect([snapshot.source.width, snapshot.source.height]).toEqual([2, 2])
  })

  it('keeps the dimensions of the canvas it was taken from', () => {
    const snapshot = createSnapshot(createCanvas(4, 2), 1)

    expect([snapshot.canvasWidth, snapshot.canvasHeight]).toEqual([4, 2])
  })

  it('does not take a snapshot when no 2d context is available', () => {
    const canvas = createCanvas(2, 2)
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null)

    expect(createCanvasSnapshot(canvas, 1000)).toBeUndefined()
  })

  it('is not affected by later draws on the canvas', async () => {
    const canvas = createCanvas(1, 1, ['red'])
    const snapshot = createSnapshot(canvas, 1000)

    fill(canvas, 'blue')

    expect(await imagePixels((await captureCanvasImage(snapshot))!)).toEqual([255, 0, 0, 255])
  })
})

describe('captureCanvasImage', () => {
  it('encodes the snapshot as a PNG image', async () => {
    const snapshot = createSnapshot(createCanvas(2, 2), 1000)

    const image = await captureCanvasImage(snapshot)

    expect(image?.type).toBe('image/png')
  })

  it('encodes an image with the dimensions of the snapshot', async () => {
    const snapshot = createSnapshot(createCanvas(4, 2), 2)

    const image = await captureCanvasImage(snapshot)

    expect(await imageSize(image!)).toEqual([2, 1])
  })

  it('downscales the whole canvas instead of cropping it', async () => {
    // Left half red, right half blue: a cropped image would be fully red.
    const snapshot = createSnapshot(createCanvas(4, 2, ['red', 'blue']), 2)

    const image = await captureCanvasImage(snapshot)

    expect(await imagePixels(image!)).toEqual([255, 0, 0, 255, 0, 0, 255, 255])
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

function decodeImage(image: Blob): Promise<{ pixels: number[]; size: [number, number] }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(image)
    const element = new Image()
    element.onload = () => {
      const width = element.naturalWidth
      const height = element.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')!
      context.drawImage(element, 0, 0)
      URL.revokeObjectURL(url)
      resolve({ pixels: Array.from(context.getImageData(0, 0, width, height).data), size: [width, height] })
    }
    element.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('failed to decode the image'))
    }
    element.src = url
  })
}

async function imageSize(image: Blob): Promise<[number, number]> {
  return (await decodeImage(image)).size
}

async function imagePixels(image: Blob): Promise<number[]> {
  return (await decodeImage(image)).pixels
}
