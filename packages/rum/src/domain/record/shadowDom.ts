import { addTelemetryDebug, DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { startMutationObserver } from './mutationObserver'
import { initInputObserver } from './observers'
import type { MutationCallBack, InputCallback } from './observers'

interface ShadowDomCallBacks {
  stop: () => void
  flush: () => void
}

export type ShadowDomCallBack = (shadowRoot: ShadowRoot) => void

export interface ShadowRootsController {
  addShadowRoot: ShadowDomCallBack
  removeShadowRoot: ShadowDomCallBack
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
  const shadowDomCallBacks = new Map<ShadowRoot, ShadowDomCallBacks>()

  function removeShadowRoot(shadowRoot: ShadowRoot) {
    const entry = shadowDomCallBacks.get(shadowRoot)
    if (!entry) {
      addTelemetryDebug('no shadow root in map')
      return
    }
    entry.stop()
    shadowDomCallBacks.delete(shadowRoot)
  }

  function addShadowRoot(shadowRoot: ShadowRoot) {
    const { stop: stopMutationObserver, flush } = startMutationObserver(
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
    shadowDomCallBacks.set(shadowRoot, {
      flush,
      stop: () => {
        stopMutationObserver()
        stopInputObserver()
      },
    })
  }
  const shadowRootsController: ShadowRootsController = {
    stop: () => {
      shadowDomCallBacks.forEach(({ stop }) => stop())
    },
    flush: () => {
      shadowDomCallBacks.forEach(({ flush }) => flush())
    },
    addShadowRoot,
    removeShadowRoot,
  }
  return shadowRootsController
}
