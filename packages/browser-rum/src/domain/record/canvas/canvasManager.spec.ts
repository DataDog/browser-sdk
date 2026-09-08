import { registerCleanupTask } from '@datadog/browser-core/test'
import { CanvasStatus, createCanvasManager } from './canvasManager'

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

  it('stores the last capture hash', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    expect(captureAttempt.lastChangeHash).toBeUndefined()

    captureAttempt.setLastChangeHash('hash')

    expect(canvasManager.startCaptureAttempt(canvas).lastChangeHash).toBe('hash')
    expect(captureAttempt.isCurrent()).toBe(true)
  })

  it('invalidates the capture attempt when the bitmap is reset', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    captureAttempt.setLastChangeHash('hash')

    canvasManager.resetCanvasBitmap(canvas)

    expect(captureAttempt.isCurrent()).toBe(false)
    expect(canvasManager.startCaptureAttempt(canvas).lastChangeHash).toBeUndefined()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('forgets the tracking state when a canvas is forgotten', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    captureAttempt.setLastChangeHash('hash')

    canvasManager.forgetCanvas(canvas)

    expect(captureAttempt.isCurrent()).toBe(false)
    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.startCaptureAttempt(canvas).lastChangeHash).toBeUndefined()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('resets capture hashes for a new record stream', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    const captureAttempt = canvasManager.startCaptureAttempt(canvas)
    captureAttempt.setLastChangeHash('hash')

    canvasManager.reset()

    expect(captureAttempt.isCurrent()).toBe(false)
    expect(canvasManager.startCaptureAttempt(canvas).lastChangeHash).toBeUndefined()
  })

  it('keeps a tainted canvas tainted after its bitmap is reset', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)
    canvasManager.resetCanvasBitmap(canvas)

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
