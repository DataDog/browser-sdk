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

    const captureState = canvasManager.getCaptureState(canvas)
    expect(captureState.lastChangeHash).toBeUndefined()

    captureState.setLastChangeHash('hash')

    expect(canvasManager.getCaptureState(canvas).lastChangeHash).toBe('hash')
    expect(captureState.isCurrent()).toBe(true)
  })

  it('invalidates the capture state when the bitmap is reset', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    const captureState = canvasManager.getCaptureState(canvas)
    captureState.setLastChangeHash('hash')

    canvasManager.resetCanvasBitmap(canvas)

    expect(captureState.isCurrent()).toBe(false)
    expect(canvasManager.getCaptureState(canvas).lastChangeHash).toBeUndefined()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('forgets the capture state when a canvas is forgotten', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    const captureState = canvasManager.getCaptureState(canvas)
    captureState.setLastChangeHash('hash')

    canvasManager.forgetCanvas(canvas)

    expect(captureState.isCurrent()).toBe(false)
    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.getCaptureState(canvas).lastChangeHash).toBeUndefined()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('resets capture hashes for a new record stream', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    const captureState = canvasManager.getCaptureState(canvas)
    captureState.setLastChangeHash('hash')

    canvasManager.reset()

    expect(captureState.isCurrent()).toBe(false)
    expect(canvasManager.getCaptureState(canvas).lastChangeHash).toBeUndefined()
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
