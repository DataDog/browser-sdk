import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { BrowserIncrementalSnapshotRecord } from '../../types'
import { trackInput, trackMutation, trackScroll } from './trackers'
import type { ElementsScrollPositions } from './elementsScrollPositions'

interface ShadowRootController {
  stop: () => void
  flush: () => void
}

export type ShadowRootCallBack = (shadowRoot: ShadowRoot) => void

export interface ShadowRootsController {
  addShadowRoot: ShadowRootCallBack
  removeShadowRoot: ShadowRootCallBack
  stop: () => void
  flush: () => void
}

export const initShadowRootsController = (
  configuration: RumConfiguration,
  callback: (record: BrowserIncrementalSnapshotRecord) => void,
  elementsScrollPositions: ElementsScrollPositions
): ShadowRootsController => {
  const controllerByShadowRoot = new Map<ShadowRoot, ShadowRootController>()

  const shadowRootsController: ShadowRootsController = {
    addShadowRoot: (shadowRoot: ShadowRoot) => {
      if (controllerByShadowRoot.has(shadowRoot)) {
        return
      }
      const mutationTracker = trackMutation(callback, configuration, shadowRootsController, shadowRoot)
      // The change event does not bubble up across the shadow root, we have to listen on the shadow root
      const inputTracker = trackInput(configuration, callback, shadowRoot)
      // The scroll event does not bubble up across the shadow root, we have to listen on the shadow root
      const scrollTracker = trackScroll(configuration, callback, elementsScrollPositions, shadowRoot)
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
