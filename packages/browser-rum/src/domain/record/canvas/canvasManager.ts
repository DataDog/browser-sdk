import { getMutationObserverConstructor } from '@datadog/browser-rum-core'
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
  /** The node left the DOM: forget its tracking state, but not its taint */
  forgetCanvas: (canvas: HTMLCanvasElement) => void
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
  lastChangeHash?: string
}

export function createCanvasManager(): CanvasManager {
  const MutationObserver = getMutationObserverConstructor()
  const dirtyCanvases = new Set<HTMLCanvasElement>()
  const taintedCanvases = new WeakSet<HTMLCanvasElement>()
  const canvasObservers = new Map<HTMLCanvasElement, InstanceType<typeof MutationObserver>>()
  const canvasSnapshots = new WeakMap<HTMLCanvasElement, CanvasSnapshot>()
  let canvasContentMutations: CanvasContentMutation[] = []
  let canvasTrackingStates = new WeakMap<HTMLCanvasElement, CanvasTrackingState>()

  function getTrackingState(canvas: HTMLCanvasElement): CanvasTrackingState {
    let trackingState = canvasTrackingStates.get(canvas)
    if (!trackingState) {
      trackingState = { capturePending: false }
      canvasTrackingStates.set(canvas, trackingState)
    }
    return trackingState
  }

  function startCaptureAttempt(canvas: HTMLCanvasElement): CanvasCaptureAttempt {
    const trackingState = getTrackingState(canvas)
    trackingState.capturePending = true
    const isCurrent = () => canvasTrackingStates.get(canvas) === trackingState

    return {
      lastChangeHash: trackingState.lastChangeHash,
      snapshot: canvasSnapshots.get(canvas),
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

  function observeCanvas(canvas: HTMLCanvasElement) {
    if (canvasObservers.has(canvas)) {
      return
    }
    const observer = new MutationObserver(() => markDirty(canvas))
    observer.observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] })
    canvasObservers.set(canvas, observer)
  }

  function forgetCanvasObserver(canvas: HTMLCanvasElement) {
    canvasObservers.get(canvas)?.disconnect()
    canvasObservers.delete(canvas)
  }

  return {
    markCanvas: (canvas, status) => {
      observeCanvas(canvas)
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
      canvasSnapshots.set(canvas, snapshot)
    },

    forgetCanvas: (canvas) => {
      dirtyCanvases.delete(canvas)
      canvasTrackingStates.delete(canvas)
      canvasSnapshots.delete(canvas)
      forgetCanvasObserver(canvas)
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
      canvasTrackingStates.delete(canvas)
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
      canvasTrackingStates = new WeakMap()
      canvasObservers.forEach((observer) => observer.disconnect())
      canvasObservers.clear()
    },
  }
}
