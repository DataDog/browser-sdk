import { registerCleanupTask } from '@datadog/browser-core/test'
import { copyCanvasSnapshot, createCanvasSnapshot } from './canvasSnapshot'
import { isCanvasWorkerSupported } from './canvasWorker'

describe('createCanvasSnapshot', () => {
  beforeEach(() => {
    if (!isCanvasWorkerSupported()) {
      pending('canvas recording not supported')
    }
  })

  it('downscales the snapshot to the configured maximum dimension', async () => {
    const bitmap = await createCanvasSnapshot(createCanvas(4, 2), 2).bitmap

    expect([bitmap.width, bitmap.height]).toEqual([2, 1])
  })

  it('does not upscale a canvas smaller than the maximum dimension', async () => {
    const bitmap = await createCanvasSnapshot(createCanvas(2, 2), 1000).bitmap

    expect([bitmap.width, bitmap.height]).toEqual([2, 2])
  })

  it('keeps the dimensions of the canvas it was taken from', () => {
    const snapshot = createCanvasSnapshot(createCanvas(4, 2), 1)

    expect([snapshot.canvasWidth, snapshot.canvasHeight]).toEqual([4, 2])
  })

  it('is not affected by later draws on the canvas', async () => {
    const canvas = createCanvas(1, 1)
    const snapshot = createCanvasSnapshot(canvas, 1000)

    fill(canvas, 'blue')

    expect(firstPixelOf(await snapshot.bitmap)).toEqual([255, 0, 0, 255])
  })

  it('does not report an unhandled rejection when the snapshot fails and is never captured', async () => {
    const onUnhandledRejection = jasmine.createSpy()
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    registerCleanupTask(() => window.removeEventListener('unhandledrejection', onUnhandledRejection))

    const snapshot = createCanvasSnapshot(createCanvas(0, 0), 1000)

    await expectAsync(snapshot.bitmap).toBeRejected()
    await new Promise((resolve) => setTimeout(resolve))
    expect(onUnhandledRejection).not.toHaveBeenCalled()
  })
})

describe('copyCanvasSnapshot', () => {
  beforeEach(() => {
    if (!isCanvasWorkerSupported()) {
      pending('canvas recording not supported')
    }
  })

  it('keeps the original snapshot usable once the copy is consumed', async () => {
    const snapshot = createCanvasSnapshot(createCanvas(1, 1), 1000)

    ;(await copyCanvasSnapshot(snapshot).bitmap).close()

    expect(firstPixelOf(await snapshot.bitmap)).toEqual([255, 0, 0, 255])
  })
})

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  fill(canvas, 'red')
  document.body.appendChild(canvas)
  registerCleanupTask(() => canvas.remove())
  return canvas
}

function fill(canvas: HTMLCanvasElement, color: string) {
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, canvas.width, canvas.height)
}

function firstPixelOf(bitmap: ImageBitmap): number[] {
  const context = new OffscreenCanvas(1, 1).getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  return Array.from(context.getImageData(0, 0, 1, 1).data)
}
