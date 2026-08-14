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
    getDirtyCanvases: () => Array.from(dirtyCanvases),
    isCanvasDirty: (canvas) => dirtyCanvases.has(canvas),
    markCanvasClean: (canvas) => dirtyCanvases.delete(canvas),
    markCanvasDirty: (canvas) => dirtyCanvases.add(canvas),
  }
}
