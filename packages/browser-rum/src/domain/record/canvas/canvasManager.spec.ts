import { registerCleanupTask } from '@datadog/browser-core/test'
import { createCanvasManager } from './canvasManager'

describe('CanvasManager', () => {
  it('tracks whether a canvas is dirty', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()

    canvasManager.markCanvasDirty(canvas)
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()

    canvasManager.markCanvasClean(canvas)
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()

    canvasManager.markCanvasDirty(canvas)
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()
  })

  it('tracks canvases independently', () => {
    const canvasManager = createCanvasManager()
    const dirtyCanvas = appendCanvas()
    const cleanCanvas = appendCanvas()

    canvasManager.markCanvasDirty(dirtyCanvas)

    expect(canvasManager.isCanvasDirty(dirtyCanvas)).toBeTrue()
    expect(canvasManager.isCanvasDirty(cleanCanvas)).toBeFalse()
  })

  it('returns connected dirty canvases', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvasDirty(canvas)

    expect(canvasManager.getDirtyCanvases()).toEqual([canvas])

    canvasManager.markCanvasClean(canvas)
    expect(canvasManager.getDirtyCanvases()).toEqual([])
  })

  it('does not retain detached canvases', () => {
    const canvasManager = createCanvasManager()
    const canvas = document.createElement('canvas')

    canvasManager.markCanvasDirty(canvas)

    expect(canvasManager.getDirtyCanvases()).toEqual([])

    document.body.appendChild(canvas)
    registerCleanupTask(() => canvas.remove())
    expect(canvasManager.getDirtyCanvases()).toEqual([])
  })

  it('clears dirty canvases', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvasDirty(canvas)

    canvasManager.clearDirtyCanvases()

    expect(canvasManager.getDirtyCanvases()).toEqual([])
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('does not return tainted canvases for capture', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvasDirty(canvas)
    canvasManager.markCanvasTainted(canvas)

    expect(canvasManager.getCapturableCanvases()).toEqual([])
    canvasManager.markCanvasDirty(canvas)
    expect(canvasManager.getCapturableCanvases()).toEqual([])
  })

  it('makes a tainted canvas capturable after its bitmap is reset', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvasDirty(canvas)
    const captureId = canvasManager.markCanvasCaptureStarted(canvas)!
    canvasManager.setPreviousHash(canvas, 'hash')
    canvasManager.markCanvasTainted(canvas)

    canvasManager.markCanvasBitmapReset(canvas)

    expect(canvasManager.getPreviousHash(canvas)).toBeUndefined()
    expect(canvasManager.isCanvasCaptureInFlight(canvas, captureId)).toBeFalse()
    expect(canvasManager.getCapturableCanvases()).toEqual([canvas])
  })

  it('forgets capture and taint state when a canvas node is removed', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvasDirty(canvas)
    const captureId = canvasManager.markCanvasCaptureStarted(canvas)!
    canvasManager.setPreviousHash(canvas, 'hash')
    canvasManager.markCanvasTainted(canvas)

    canvasManager.forgetCanvasNode(canvas)

    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
    expect(canvasManager.getPreviousHash(canvas)).toBeUndefined()
    expect(canvasManager.isCanvasCaptureInFlight(canvas, captureId)).toBeFalse()
    canvasManager.markCanvasDirty(canvas)
    expect(canvasManager.getCapturableCanvases()).toEqual([canvas])
  })

  it('resets capture hashes without forgetting tainted canvases', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvasDirty(canvas)
    const captureId = canvasManager.markCanvasCaptureStarted(canvas)!
    canvasManager.setPreviousHash(canvas, 'hash')
    canvasManager.markCanvasCaptureFinished(canvas, captureId)
    canvasManager.markCanvasTainted(canvas)

    canvasManager.reset()

    expect(canvasManager.getPreviousHash(canvas)).toBeUndefined()
    canvasManager.markCanvasDirty(canvas)
    expect(canvasManager.getCapturableCanvases()).toEqual([])
  })
})

function appendCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  registerCleanupTask(() => canvas.remove())
  return canvas
}
