export interface CanvasManager {
  clearDirtyCanvases: () => void
  getDirtyCanvases: () => HTMLCanvasElement[]
  isCanvasDirty: (canvas: HTMLCanvasElement) => boolean
  markCanvasClean: (canvas: HTMLCanvasElement) => void
  markCanvasDirty: (canvas: HTMLCanvasElement) => void
}

export function createCanvasManager(): CanvasManager {
  const dirtyCanvases = new Set<HTMLCanvasElement>()

  return {
    clearDirtyCanvases: () => dirtyCanvases.clear(),
    getDirtyCanvases: () => {
      const connectedCanvases: HTMLCanvasElement[] = []

      dirtyCanvases.forEach((canvas) => {
        if (canvas.isConnected) {
          connectedCanvases.push(canvas)
        } else {
          dirtyCanvases.delete(canvas)
        }
      })

      return connectedCanvases
    },
    isCanvasDirty: (canvas) => dirtyCanvases.has(canvas),
    markCanvasClean: (canvas) => dirtyCanvases.delete(canvas),
    markCanvasDirty: (canvas) => {
      if (canvas.isConnected) {
        dirtyCanvases.add(canvas)
      }
    },
  }
}
