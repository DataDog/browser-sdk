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
})

function appendCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  registerCleanupTask(() => canvas.remove())
  return canvas
}
