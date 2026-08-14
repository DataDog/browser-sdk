export interface CanvasManager {
  isCanvasDirty: (canvas: HTMLCanvasElement) => boolean
  markCanvasClean: (canvas: HTMLCanvasElement) => void
  markCanvasDirty: (canvas: HTMLCanvasElement) => void
}

export function createCanvasManager(): CanvasManager {
  const dirtyCanvases = new WeakSet<HTMLCanvasElement>()

  return {
    isCanvasDirty: (canvas) => dirtyCanvases.has(canvas),
    markCanvasClean: (canvas) => dirtyCanvases.delete(canvas),
    markCanvasDirty: (canvas) => dirtyCanvases.add(canvas),
  }
}
