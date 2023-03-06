import { addTelemetryDebug, DOM_EVENT, isExperimentalFeatureEnabled } from '@datadog/browser-core'
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
        addTelemetryDebug('no shadow root in map', {
          shadowRoot: shadowRoot ? shadowRoot.nodeName : 'no node name',
          childrenLength: shadowRoot ? shadowRoot.childElementCount : '-1',
          controllerByShadowRootSize: controllerByShadowRoot.size,
          html:
            shadowRoot && isExperimentalFeatureEnabled('shadow_dom_debug')
              ? shadowRoot.innerHTML.substring(0, 2000)
              : undefined,
        })
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
