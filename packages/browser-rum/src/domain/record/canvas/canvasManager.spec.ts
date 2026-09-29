import { registerCleanupTask, waitNextMicrotask } from '@datadog/browser-core/test'
import { CanvasStatus, createCanvasManager } from './canvasManager'
import { createCanvasSnapshot } from './canvasSnapshot'

describe('CanvasManager', () => {
  it('tracks whether a canvas is capturable', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    canvasManager.markCanvas(canvas, CanvasStatus.Clean)
    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('tracks canvases independently', () => {
    const canvasManager = createCanvasManager()
    const dirtyCanvas = appendCanvas()
    const cleanCanvas = appendCanvas()

    canvasManager.markCanvas(dirtyCanvas, CanvasStatus.Dirty)

    expect(canvasManager.takeCapturableCanvases()).toEqual([dirtyCanvas])
    expect(canvasManager.takeCapturableCanvases().includes(cleanCanvas)).toBe(false)
  })

  it('does not retain detached canvases', () => {
    const canvasManager = createCanvasManager()
    const canvas = document.createElement('canvas')

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    document.body.appendChild(canvas)
    registerCleanupTask(() => canvas.remove())
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('does not return tainted canvases for capture', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)

    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('takes canvases and lets a later draw make them capturable again', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('marks a canvas dirty when its width or height is assigned', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvas.setAttribute('width', '300')
    canvasManager.markCanvas(canvas, CanvasStatus.Clean)

    canvas.setAttribute('width', '300')
    await waitNextMicrotask()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])

    canvas.height += 1
    await waitNextMicrotask()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('does not mark a canvas dirty when another attribute changes', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvas(canvas, CanvasStatus.Clean)

    canvas.className = 'foo'
    await waitNextMicrotask()

    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('stores the last capture hash', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    expect(captureAttempt.lastChangeHash).toBeUndefined()

    captureAttempt.setLastChangeHash('hash')

    expect(canvasManager.startCaptureAttempt(canvas).lastChangeHash).toBe('hash')
    expect(captureAttempt.isCurrent()).toBe(true)
  })

  it('retries a rejected capture without retaining its hash', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    captureAttempt.setLastChangeHash('hash')

    canvasManager.retryCanvas(canvas)

    expect(captureAttempt.isCurrent()).toBe(false)
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
    expect(canvasManager.startCaptureAttempt(canvas).lastChangeHash).toBeUndefined()
  })

  it('keeps a frozen snapshot when retrying a rejected capture', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    const snapshot = createCanvasSnapshot(canvas, 1000)!
    canvasManager.setCanvasSnapshot(canvas, snapshot)

    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    canvasManager.retryCanvas(canvas)

    expect(captureAttempt.isCurrent()).toBe(false)
    expect(canvasManager.startCaptureAttempt(canvas).snapshot).toBe(snapshot)
  })

  it('waits for queued content to be consumed before capturing again', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    canvasManager.addCanvasContentMutation({ canvas, captureAttempt, hash: 'hash', image: new Blob() })
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    expect(canvasManager.takeCapturableCanvases()).toEqual([])
    expect(canvasManager.takeCanvasContentMutations()).toHaveSize(1)
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('does not invalidate a capture attempt when the canvas is resized', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    const captureAttempt = canvasManager.startCaptureAttempt(canvas)

    canvas.width += 1
    await waitNextMicrotask()

    expect(captureAttempt.isCurrent()).toBe(true)
    canvasManager.discardCaptureAttempt(canvas, captureAttempt)
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('forgets per-node capture state and its latest snapshot', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    const snapshot = createCanvasSnapshot(canvas, 1000)!

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    captureAttempt.setLastChangeHash('hash')
    canvasManager.setCanvasSnapshot(canvas, snapshot)

    canvasManager.forgetCanvas(canvas)

    expect(captureAttempt.isCurrent()).toBe(false)
    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    const nextCaptureAttempt = canvasManager.startCaptureAttempt(canvas)
    expect(nextCaptureAttempt.lastChangeHash).toBeUndefined()
    expect(nextCaptureAttempt.snapshot).toBeUndefined()
    canvasManager.discardCaptureAttempt(canvas, nextCaptureAttempt)
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('stops observing a forgotten canvas', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvas(canvas, CanvasStatus.Clean)

    canvasManager.forgetCanvas(canvas)
    canvas.width += 1
    await waitNextMicrotask()

    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('resets capture hashes for a new record stream', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    const snapshot = createCanvasSnapshot(canvas, 1000)!

    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    captureAttempt.setLastChangeHash('hash')
    canvasManager.setCanvasSnapshot(canvas, snapshot)

    canvasManager.reset()

    expect(captureAttempt.isCurrent()).toBe(false)
    const nextCaptureAttempt = canvasManager.startCaptureAttempt(canvas)
    expect(nextCaptureAttempt.lastChangeHash).toBeUndefined()
    expect(nextCaptureAttempt.snapshot).toBe(snapshot)
  })

  it('keeps a tainted canvas tainted after it is resized', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)
    canvas.width += 1
    await waitNextMicrotask()

    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('stops observing canvases on reset', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvas(canvas, CanvasStatus.Clean)

    canvasManager.reset()
    canvas.width += 1
    await waitNextMicrotask()

    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('does not forget tainted canvases on reset', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)
    canvasManager.reset()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })
})

function appendCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  registerCleanupTask(() => canvas.remove())
  return canvas
}
