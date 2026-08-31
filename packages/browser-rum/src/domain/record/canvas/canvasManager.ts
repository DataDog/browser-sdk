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
  /** stores the changeHash and marks the canvas clean only if no draw happened since the attempt started */
  settle: (changeHash: string) => void
  /** SecurityError taints the canvas; any other error leaves it dirty for the next tick */
  fail: (error: unknown) => void
}

export interface CanvasManager {
  /** Single entry point for the canvas status */
  markCanvas: (canvas: HTMLCanvasElement, status: CanvasStatus) => void
  /** The node left the DOM: forget everything but the taint */
  forgetCanvas: (canvas: HTMLCanvasElement) => void
  /** width/height were assigned: the bitmap was cleared, so untaint and mark dirty */
  resetCanvasBitmap: (canvas: HTMLCanvasElement) => void
  /** Dirty, connected, not tainted, no capture in flight (disconnected canvases are forgotten as a side effect) */
  getCapturableCanvases: () => HTMLCanvasElement[]
  /** Runs `run` with a capture attempt; the in-flight state is released only when the returned promise settles */
  capture: (canvas: HTMLCanvasElement, run: (attempt: CanvasCaptureAttempt) => Promise<void>) => Promise<void>
  /** New record stream: discards the per-stream state (not the taint) */
  reset: () => void
}

/** Identifies a specific capture() call so a stale attempt can tell it no longer owns the canvas */
type CaptureToken = object

interface CanvasState {
  version: number
  capture?: CaptureToken
  lastChangeHash?: string
}

export function createCanvasManager(): CanvasManager {
  const dirtyCanvases = new Set<HTMLCanvasElement>()
  const taintedCanvases = new WeakSet<HTMLCanvasElement>()
  let canvasStates = new WeakMap<HTMLCanvasElement, CanvasState>()

  function getState(canvas: HTMLCanvasElement): CanvasState {
    let state = canvasStates.get(canvas)
    if (!state) {
      state = { version: 0 }
      canvasStates.set(canvas, state)
    }
    return state
  }

  function markDirty(canvas: HTMLCanvasElement) {
    if (!canvas.isConnected || taintedCanvases.has(canvas)) {
      return
    }
    getState(canvas).version++
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
          assertNever(status)
      }
    },

    forgetCanvas: (canvas) => {
      dirtyCanvases.delete(canvas)
      canvasStates.delete(canvas)
    },

    resetCanvasBitmap: (canvas) => {
      taintedCanvases.delete(canvas)
      canvasStates.delete(canvas)
      markDirty(canvas)
    },

    getCapturableCanvases: () => {
      const capturableCanvases: HTMLCanvasElement[] = []

      dirtyCanvases.forEach((canvas) => {
        if (!canvas.isConnected) {
          dirtyCanvases.delete(canvas)
        } else if (!taintedCanvases.has(canvas) && !canvasStates.get(canvas)?.capture) {
          capturableCanvases.push(canvas)
        }
      })

      return capturableCanvases
    },

    capture: (canvas, run) => {
      // getCapturableCanvases() already filters out tainted/in-flight canvases; these guards
      // just make capture() safe to call directly (as the specs do) without going through it.
      if (taintedCanvases.has(canvas)) {
        return Promise.resolve()
      }

      const state = getState(canvas)
      if (state.capture) {
        return Promise.resolve()
      }

      const startVersion = state.version
      const token: CaptureToken = {}
      state.capture = token

      const isCurrent = () => canvasStates.get(canvas)?.capture === token

      const attempt: CanvasCaptureAttempt = {
        lastChangeHash: state.lastChangeHash,
        isCurrent,
        settle: (changeHash) => {
          if (!isCurrent()) {
            return
          }
          state.lastChangeHash = changeHash
          if (state.version === startVersion) {
            markClean(canvas)
          }
        },
        fail: (error) => {
          if (!isCurrent()) {
            return
          }
          if (isSecurityError(error)) {
            markTainted(canvas)
          } else {
            markDirty(canvas)
          }
        },
      }

      return Promise.resolve()
        .then(() => run(attempt))
        .catch((error: unknown) => attempt.fail(error))
        .finally(() => {
          if (state.capture === token) {
            state.capture = undefined
          }
        })
    },

    reset: () => {
      dirtyCanvases.clear()
      canvasStates = new WeakMap()
    },
  }
}

function isSecurityError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'SecurityError'
}

function assertNever(value: never): never {
  throw new Error(`Unexpected CanvasStatus: ${String(value)}`)
}
