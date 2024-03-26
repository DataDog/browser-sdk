import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { InputCallback, MutationCallBack } from './trackers'
import { trackInput, trackMutation } from './trackers'

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
  {
    mutationCb,
    inputCb,
  }: {
    mutationCb: MutationCallBack
    inputCb: InputCallback
  }
): ShadowRootsController => {
  const controllerByShadowRoot = new Map<ShadowRoot, ShadowRootController>()

  const shadowRootsController: ShadowRootsController = {
    addShadowRoot: (shadowRoot: ShadowRoot) => {
      if (controllerByShadowRoot.has(shadowRoot)) {
        return
      }
      const mutationTracker = trackMutation(mutationCb, configuration, shadowRootsController, shadowRoot)
      // the change event no do bubble up across the shadow root, we have to listen on the shadow root
      const inputTracker = trackInput(configuration, inputCb, shadowRoot)
      controllerByShadowRoot.set(shadowRoot, {
        flush: () => mutationTracker.flush(),
        stop: () => {
          mutationTracker.stop()
          inputTracker.stop()
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
