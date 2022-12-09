import { addTelemetryDebug, DOM_EVENT } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { startMutationObserver } from './mutationObserver'
import { initInputObserver } from './observers'
import type { MutationCallBack, InputCallback } from './observers'

interface ShadowDomCallBacks {
  stop: () => void
  flush: () => void
}

export const withShadowDomHelpers = (
  configuration: RumConfiguration,
  {
    mutationCb,
    inputCb,
  }: {
    mutationCb: MutationCallBack
    inputCb: InputCallback
  }
) => {
  const shadowDomCallBacks = new Map<ShadowRoot, ShadowDomCallBacks>()

  const shadowDomRemovedCallback = (shadowRoot: ShadowRoot) => {
    const entry = shadowDomCallBacks.get(shadowRoot)
    if (!entry) {
      addTelemetryDebug('no shadow root in map')
      return
    }
    entry.stop()
    shadowDomCallBacks.delete(shadowRoot)
  }

  const shadowDomCreatedCallback = (shadowRoot: ShadowRoot) => {
    const { stop: stopMutationObserver, flush } = startMutationObserver(
      mutationCb,
      configuration,
      { shadowDomCreatedCallback, shadowDomRemovedCallback },
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
  return {
    shadowDomCallBacks,
    flush: () => {
      shadowDomCallBacks.forEach(({ flush }) => flush())
    },
    shadowDomRemovedCallback,
    shadowDomCreatedCallback,
  }
}
