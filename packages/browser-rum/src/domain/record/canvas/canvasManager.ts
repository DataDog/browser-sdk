import type { CanvasSnapshot } from './canvasSnapshot'

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
  /** snapshot frozen while the WebGL drawing buffer was still available */
  readonly snapshot: CanvasSnapshot | undefined
  /** false if the canvas was forgotten/reset, or if another attempt took its place */
  isCurrent: () => boolean
  /** stores the changeHash */
  setLastChangeHash: (changeHash: string) => void
}

export interface CanvasContentMutation {
  canvas: HTMLCanvasElement
  captureAttempt: CanvasCaptureAttempt
  hash: string
  image: Blob
}

export interface CanvasManager {
  /** Single entry point for the canvas status */
  markCanvas: (canvas: HTMLCanvasElement, status: CanvasStatus) => void
  /** Stores a snapshot taken before a WebGL drawing buffer is discarded */
  setCanvasSnapshot: (canvas: HTMLCanvasElement, snapshot: CanvasSnapshot) => void
  /** Invalidates the current bitmap state as soon as a size mutation is observed */
  prepareCanvasBitmapReset: (canvas: HTMLCanvasElement) => void
  /** The node left the DOM: reset its per-node state, but preserve its latest snapshot and taint */
  forgetCanvas: (canvas: HTMLCanvasElement) => void
  /** width/height were assigned: the bitmap was cleared, so drop the last hash and mark dirty */
  resetCanvasBitmap: (canvas: HTMLCanvasElement) => void
  /** Takes dirty, connected, non-tainted canvases and clears their dirty state */
  takeCapturableCanvases: () => HTMLCanvasElement[]
  /** Starts a capture attempt for a canvas */
  startCaptureAttempt: (canvas: HTMLCanvasElement) => CanvasCaptureAttempt
  discardCaptureAttempt: (canvas: HTMLCanvasElement, captureAttempt: CanvasCaptureAttempt) => void
  /** Discards the last capture hash and retries a rejected capture */
  retryCanvas: (canvas: HTMLCanvasElement) => void
  addCanvasContentMutation: (mutation: CanvasContentMutation) => void
  takeCanvasContentMutations: () => CanvasContentMutation[]
  /** New record stream: resets per-stream state while preserving snapshots and taint */
  reset: () => void
}

interface CanvasTrackingState {
  capturePending: boolean
  streamId: number
  lastChangeHash?: string
  snapshot?: CanvasSnapshot
  bitmapResetPending?: boolean
}

export function createCanvasManager(): CanvasManager {
  const dirtyCanvases = new Set<HTMLCanvasElement>()
  const taintedCanvases = new WeakSet<HTMLCanvasElement>()
  let canvasContentMutations: CanvasContentMutation[] = []
  const canvasTrackingStates = new WeakMap<HTMLCanvasElement, CanvasTrackingState>()
  let streamId = 0

  function getTrackingState(canvas: HTMLCanvasElement): CanvasTrackingState {
    let trackingState = canvasTrackingStates.get(canvas)
    if (trackingState?.streamId !== streamId) {
      // Preserve the latest WebGL snapshot so the canvas does not start empty in the new stream.
      trackingState = { capturePending: false, streamId, snapshot: trackingState?.snapshot }
      canvasTrackingStates.set(canvas, trackingState)
    }
    return trackingState
  }

  function startCaptureAttempt(canvas: HTMLCanvasElement): CanvasCaptureAttempt {
    const trackingState = getTrackingState(canvas)
    trackingState.capturePending = true
    const isCurrent = () => canvasTrackingStates.get(canvas) === trackingState && trackingState.streamId === streamId

    return {
      lastChangeHash: trackingState.lastChangeHash,
      snapshot: trackingState.snapshot,
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

    setCanvasSnapshot: (canvas, snapshot) => {
      getTrackingState(canvas).snapshot = snapshot
    },

    prepareCanvasBitmapReset: (canvas) => {
      // Mutation serialization is delayed, so invalidate the old bitmap state as soon as the resize is observed.
      canvasTrackingStates.set(canvas, { bitmapResetPending: true, capturePending: false, streamId })
    },

    forgetCanvas: (canvas) => {
      dirtyCanvases.delete(canvas)
      const snapshot = canvasTrackingStates.get(canvas)?.snapshot
      // A reinserted WebGL canvas may no longer have a readable drawing buffer.
      // Keep its latest snapshot while invalidating its capture attempt and per-node hash.
      canvasTrackingStates.set(canvas, { capturePending: false, streamId, snapshot })
    },

    resetCanvasBitmap: (canvas) => {
      const trackingState = canvasTrackingStates.get(canvas)
      if (trackingState?.streamId === streamId && trackingState.bitmapResetPending) {
        // Keep a WebGL snapshot that may have been captured after the resize was observed.
        trackingState.bitmapResetPending = false
      } else {
        canvasTrackingStates.delete(canvas)
      }
      markDirty(canvas)
    },

    takeCapturableCanvases: () => {
      const capturableCanvases: HTMLCanvasElement[] = []

      dirtyCanvases.forEach((canvas) => {
        if (!canvas.isConnected) {
          dirtyCanvases.delete(canvas)
        } else if (!taintedCanvases.has(canvas) && !getTrackingState(canvas).capturePending) {
          dirtyCanvases.delete(canvas)
          capturableCanvases.push(canvas)
        }
      })

      return capturableCanvases
    },

    startCaptureAttempt,

    discardCaptureAttempt: (canvas, captureAttempt) => {
      if (captureAttempt.isCurrent()) {
        getTrackingState(canvas).capturePending = false
      }
    },

    retryCanvas: (canvas) => {
      const snapshot = getTrackingState(canvas).snapshot
      canvasTrackingStates.set(canvas, { capturePending: false, snapshot, streamId })
      markDirty(canvas)
    },

    addCanvasContentMutation: (mutation) => {
      canvasContentMutations.push(mutation)
    },

    takeCanvasContentMutations: () => {
      const mutations = canvasContentMutations
      canvasContentMutations = []
      for (const mutation of mutations) {
        if (mutation.captureAttempt.isCurrent()) {
          getTrackingState(mutation.canvas).capturePending = false
        }
      }
      return mutations
    },

    reset: () => {
      dirtyCanvases.clear()
      canvasContentMutations = []
      streamId += 1
    },
  }
}
