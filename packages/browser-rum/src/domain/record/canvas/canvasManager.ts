export interface CanvasManager {
  clearDirtyCanvases: () => void
  forgetCanvasNode: (canvas: HTMLCanvasElement) => void
  getCapturableCanvases: () => HTMLCanvasElement[]
  getDirtyCanvases: () => HTMLCanvasElement[]
  getPreviousHash: (canvas: HTMLCanvasElement) => string | undefined
  isCanvasCaptureInFlight: (canvas: HTMLCanvasElement, captureId: number) => boolean
  isCanvasDirty: (canvas: HTMLCanvasElement) => boolean
  markCanvasBitmapReset: (canvas: HTMLCanvasElement) => void
  markCanvasCaptureFinished: (canvas: HTMLCanvasElement, captureId: number) => void
  markCanvasCaptureStarted: (canvas: HTMLCanvasElement) => number | undefined
  markCanvasClean: (canvas: HTMLCanvasElement) => void
  markCanvasCleanIfUnchanged: (canvas: HTMLCanvasElement, captureId: number) => void
  markCanvasDirty: (canvas: HTMLCanvasElement) => void
  markCanvasTainted: (canvas: HTMLCanvasElement) => void
  reset: () => void
  setPreviousHash: (canvas: HTMLCanvasElement, hash: string) => void
}

export function createCanvasManager(): CanvasManager {
  const dirtyCanvases = new Set<HTMLCanvasElement>()
  const taintedCanvases = new WeakSet<HTMLCanvasElement>()
  let dirtyVersions = new WeakMap<HTMLCanvasElement, number>()
  let previousHashes = new WeakMap<HTMLCanvasElement, string>()
  let inFlightCaptures = new WeakMap<HTMLCanvasElement, { id: number; dirtyVersion: number }>()
  let nextCaptureId = 0

  function getDirtyVersion(canvas: HTMLCanvasElement) {
    return dirtyVersions.get(canvas) ?? 0
  }

  function markCanvasDirty(canvas: HTMLCanvasElement) {
    if (canvas.isConnected && !taintedCanvases.has(canvas)) {
      dirtyCanvases.add(canvas)
      dirtyVersions.set(canvas, getDirtyVersion(canvas) + 1)
    }
  }

  return {
    clearDirtyCanvases: () => dirtyCanvases.clear(),
    forgetCanvasNode: (canvas) => {
      dirtyCanvases.delete(canvas)
      dirtyVersions.delete(canvas)
      previousHashes.delete(canvas)
      inFlightCaptures.delete(canvas)
    },
    getCapturableCanvases: () => {
      const capturableCanvases: HTMLCanvasElement[] = []

      dirtyCanvases.forEach((canvas) => {
        if (!canvas.isConnected) {
          dirtyCanvases.delete(canvas)
        } else if (!taintedCanvases.has(canvas) && !inFlightCaptures.has(canvas)) {
          capturableCanvases.push(canvas)
        }
      })

      return capturableCanvases
    },
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
    getPreviousHash: (canvas) => previousHashes.get(canvas),
    isCanvasCaptureInFlight: (canvas, captureId) => inFlightCaptures.get(canvas)?.id === captureId,
    isCanvasDirty: (canvas) => dirtyCanvases.has(canvas),
    markCanvasCaptureFinished: (canvas, captureId) => {
      if (inFlightCaptures.get(canvas)?.id === captureId) {
        inFlightCaptures.delete(canvas)
      }
    },
    markCanvasCaptureStarted: (canvas) => {
      if (taintedCanvases.has(canvas) || inFlightCaptures.has(canvas)) {
        return undefined
      }

      const captureId = nextCaptureId++
      inFlightCaptures.set(canvas, { id: captureId, dirtyVersion: getDirtyVersion(canvas) })
      return captureId
    },
    markCanvasClean: (canvas) => dirtyCanvases.delete(canvas),
    markCanvasCleanIfUnchanged: (canvas, captureId) => {
      const capture = inFlightCaptures.get(canvas)
      if (capture?.id === captureId && capture.dirtyVersion === getDirtyVersion(canvas)) {
        dirtyCanvases.delete(canvas)
      }
    },
    markCanvasBitmapReset: (canvas) => {
      taintedCanvases.delete(canvas)
      previousHashes.delete(canvas)
      inFlightCaptures.delete(canvas)
      markCanvasDirty(canvas)
    },
    markCanvasDirty,
    markCanvasTainted: (canvas) => {
      taintedCanvases.add(canvas)
      dirtyCanvases.delete(canvas)
    },
    reset: () => {
      dirtyCanvases.clear()
      dirtyVersions = new WeakMap()
      previousHashes = new WeakMap()
      inFlightCaptures = new WeakMap()
    },
    setPreviousHash: (canvas, hash) => previousHashes.set(canvas, hash),
  }
}
