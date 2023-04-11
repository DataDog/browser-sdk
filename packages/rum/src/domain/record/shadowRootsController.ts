import { DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { InputCallback, MutationCallBack } from './observers'
import { initInputObserver, initMutationObserver } from './observers'

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
      const { stop: stopMutationObserver, flush } = initMutationObserver(
        mutationCb,
        configuration,
        shadowRootsController,
        shadowRoot
      )
      // the change event no do bubble up across the shadow root, we have to listen on the shadow root
      const stopInputObserver = initInputObserver(inputCb, configuration.defaultPrivacyLevel, {
        target: shadowRoot,
        domEvents: [DOM_EVENT.CHANGE],
      })
      controllerByShadowRoot.set(shadowRoot, {
        flush,
        stop: () => {
          stopMutationObserver()
          stopInputObserver()
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
