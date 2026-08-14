import { createCanvasManager } from './canvasManager'

describe('createCanvasManager', () => {
  it('tracks whether a canvas is dirty', () => {
    const canvasManager = createCanvasManager()
    const canvas = document.createElement('canvas')

    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()

    canvasManager.markCanvasDirty(canvas)
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()

    canvasManager.markCanvasClean(canvas)
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('tracks canvases independently', () => {
    const canvasManager = createCanvasManager()
    const dirtyCanvas = document.createElement('canvas')
    const cleanCanvas = document.createElement('canvas')

    canvasManager.markCanvasDirty(dirtyCanvas)

    expect(canvasManager.isCanvasDirty(dirtyCanvas)).toBeTrue()
    expect(canvasManager.isCanvasDirty(cleanCanvas)).toBeFalse()
    expect(canvasManager.getDirtyCanvases()).toEqual([dirtyCanvas])
  })

  it('clears all dirty canvases', () => {
    const canvasManager = createCanvasManager()
    const firstCanvas = document.createElement('canvas')
    const secondCanvas = document.createElement('canvas')

    canvasManager.markCanvasDirty(firstCanvas)
    canvasManager.markCanvasDirty(secondCanvas)
    canvasManager.clearDirtyCanvases()

    expect(canvasManager.getDirtyCanvases()).toEqual([])
  })
})
