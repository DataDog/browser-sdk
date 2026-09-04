export const enum CanvasStatus {
  /** The canvas is clean, meaning it has not been marked as dirty or tainted */
  Clean,
  /** The canvas is dirty, meaning it has been marked as dirty by a draw operation */
  Dirty,
  /** The canvas is tainted, meaning it has been marked as tainted by a SecurityError */
  Tainted,
}

export interface CanvasCaptureAttempt {
  /** changeHash emitted the last time this canvas was captured, taken when the attempt started */
  readonly lastChangeHash: string | undefined
  /** false if the canvas was forgotten/reset, or if another attempt took its place */
  isCurrent: () => boolean
  /** stores the changeHash */
  setLastChangeHash: (changeHash: string) => void
}

export interface CanvasManager {
  /** Single entry point for the canvas status */
  markCanvas: (canvas: HTMLCanvasElement, status: CanvasStatus) => void
  /** The node left the DOM: forget its tracking state, but not its taint */
  forgetCanvas: (canvas: HTMLCanvasElement) => void
  /** width/height were assigned: the bitmap was cleared, so drop the last hash and mark dirty */
  resetCanvasBitmap: (canvas: HTMLCanvasElement) => void
  /** Takes dirty, connected, non-tainted canvases and clears their dirty state */
  takeCapturableCanvases: () => HTMLCanvasElement[]
  /** Starts a capture attempt for a canvas */
  startCaptureAttempt: (canvas: HTMLCanvasElement) => CanvasCaptureAttempt
  /** New record stream: discards the per-stream tracking states (not the taint) */
  reset: () => void
}

interface CanvasTrackingState {
  lastChangeHash?: string
}

export function createCanvasManager(): CanvasManager {
  const dirtyCanvases = new Set<HTMLCanvasElement>()
  const taintedCanvases = new WeakSet<HTMLCanvasElement>()
  let canvasTrackingStates = new WeakMap<HTMLCanvasElement, CanvasTrackingState>()

  function getTrackingState(canvas: HTMLCanvasElement): CanvasTrackingState {
    let trackingState = canvasTrackingStates.get(canvas)
    if (!trackingState) {
      trackingState = {}
      canvasTrackingStates.set(canvas, trackingState)
    }
    return trackingState
  }

  function startCaptureAttempt(canvas: HTMLCanvasElement): CanvasCaptureAttempt {
    const trackingState = getTrackingState(canvas)
    const isCurrent = () => canvasTrackingStates.get(canvas) === trackingState

    return {
      lastChangeHash: trackingState.lastChangeHash,
      isCurrent,
      setLastChangeHash: (changeHash) => {
        if (isCurrent()) {
          trackingState.lastChangeHash = changeHash
        }
      },
    }
  }

  function markDirty(canvas: HTMLCanvasElement) {
    if (!canvas.isConnected || taintedCanvases.has(canvas)) {
      return
    }
    dirtyCanvases.add(canvas)
  }

  function markClean(canvas: HTMLCanvasElement) {
    dirtyCanvases.delete(canvas)
  }

  function markTainted(canvas: HTMLCanvasElement) {
    taintedCanvases.add(canvas)
    dirtyCanvases.delete(canvas)
  }

  return {
    markCanvas: (canvas, status) => {
      switch (status) {
        case CanvasStatus.Dirty:
          markDirty(canvas)
          return
        case CanvasStatus.Clean:
          markClean(canvas)
          return
        case CanvasStatus.Tainted:
          markTainted(canvas)
          return
        default:
          status satisfies never
          return
      }
    },

    forgetCanvas: (canvas) => {
      dirtyCanvases.delete(canvas)
      canvasTrackingStates.delete(canvas)
    },

    resetCanvasBitmap: (canvas) => {
      canvasTrackingStates.delete(canvas)
      markDirty(canvas)
    },

    takeCapturableCanvases: () => {
      const capturableCanvases: HTMLCanvasElement[] = []

      dirtyCanvases.forEach((canvas) => {
        if (!canvas.isConnected) {
          dirtyCanvases.delete(canvas)
        } else if (!taintedCanvases.has(canvas)) {
          dirtyCanvases.delete(canvas)
          capturableCanvases.push(canvas)
        }
      })

      return capturableCanvases
    },

    startCaptureAttempt,

    reset: () => {
      dirtyCanvases.clear()
      canvasTrackingStates = new WeakMap()
    },
  }
}
