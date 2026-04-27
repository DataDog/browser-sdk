import type { RecordingScope } from './recordingScope.ts'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { trackInput, trackMutation, trackScroll } from './trackers'

interface ShadowRootController {
  stop: () => void
  flush: () => void
}

export type AddShadowRootCallBack = (shadowRoot: ShadowRoot, scope: RecordingScope) => void
export type RemoveShadowRootCallBack = (shadowRoot: ShadowRoot) => void

export interface ShadowRootsController {
  addShadowRoot: AddShadowRootCallBack
  removeShadowRoot: RemoveShadowRootCallBack
  stop: () => void
  flush: () => void
}

export const initShadowRootsController = (
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback
): ShadowRootsController => {
  const controllerByShadowRoot = new Map<ShadowRoot, ShadowRootController>()

  const shadowRootsController: ShadowRootsController = {
    addShadowRoot: (shadowRoot: ShadowRoot, scope: RecordingScope) => {
      if (controllerByShadowRoot.has(shadowRoot)) {
        return
      }
      const mutationTracker = trackMutation(shadowRoot, emitRecord, emitStats, scope)
      // The change event does not bubble up across the shadow root, we have to listen on the shadow root
      const inputTracker = trackInput(shadowRoot, emitRecord, scope)
      // The scroll event does not bubble up across the shadow root, we have to listen on the shadow root
      const scrollTracker = trackScroll(shadowRoot, emitRecord, scope)
      controllerByShadowRoot.set(shadowRoot, {
        flush: () => mutationTracker.flush(),
        stop: () => {
          mutationTracker.stop()
          inputTracker.stop()
          scrollTracker.stop()
        },
      })
    },
    removeShadowRoot: (shadowRoot: ShadowRoot) => {
      const entry = controllerByShadowRoot.get(shadowRoot)
      if (!entry) {
        // unidentified root cause: observed in some cases with shadow DOM added by browser extensions
        return
      }
      entry.stop()
      controllerByShadowRoot.delete(shadowRoot)
    },
    stop: () => {
      controllerByShadowRoot.forEach(({ stop }) => stop())
    },
    flush: () => {
      controllerByShadowRoot.forEach(({ flush }) => flush())
    },
  }
  return shadowRootsController
}
