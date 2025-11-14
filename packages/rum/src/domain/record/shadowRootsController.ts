import { trackInput, trackMutation, trackScroll } from './trackers'
import type { MutationTransaction } from './serialization'

interface ShadowRootController {
  stop: () => void
  flush: () => void
}

export type AddShadowRootCallBack = (shadowRoot: ShadowRoot, transaction: MutationTransaction) => void
export type RemoveShadowRootCallBack = (shadowRoot: ShadowRoot) => void

export interface ShadowRootsController {
  addShadowRoot: AddShadowRootCallBack
  removeShadowRoot: RemoveShadowRootCallBack
  stop: () => void
  flush: () => void
}

export const initShadowRootsController = (): ShadowRootsController => {
  const controllerByShadowRoot = new Map<ShadowRoot, ShadowRootController>()

  const shadowRootsController: ShadowRootsController = {
    addShadowRoot: (shadowRoot: ShadowRoot, transaction: MutationTransaction) => {
      if (controllerByShadowRoot.has(shadowRoot)) {
        return
      }
      const mutationTracker = trackMutation(transaction.scope, shadowRoot)
      // The change event does not bubble up across the shadow root, we have to listen on the shadow root
      const inputTracker = trackInput(transaction.scope, shadowRoot)
      // The scroll event does not bubble up across the shadow root, we have to listen on the shadow root
      const scrollTracker = trackScroll(transaction.scope, shadowRoot)
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
