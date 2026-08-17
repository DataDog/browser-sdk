export interface CanvasManager {
  isCanvasDirty: (canvas: HTMLCanvasElement) => boolean
  markCanvasClean: (canvas: HTMLCanvasElement) => void
  markCanvasDirty: (canvas: HTMLCanvasElement) => void
}

/**
 * Tracks canvases that have already been captured and found to be clean.
 * Canvases are dirty by default so that newly discovered canvases are captured. After a capture,
 * callers can mark a canvas as clean and avoid sending it again until a drawing or DOM mutation
 * marks it dirty.
 */
export function createCanvasManager(): CanvasManager {
  const cleanCanvases = new WeakSet<HTMLCanvasElement>()

  return {
    isCanvasDirty: (canvas) => !cleanCanvases.has(canvas),
    markCanvasClean: (canvas) => cleanCanvases.add(canvas),
    markCanvasDirty: (canvas) => cleanCanvases.delete(canvas),
  }
}
