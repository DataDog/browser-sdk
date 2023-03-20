import { noop } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { startMutationObserver } from './mutationObserver'
import type { MutationCallBack } from './observers'
import { initShadowRootsController } from './shadowRootsController'

interface IframeController {
  stop: () => void
  flush: () => void
}

export type IFrameCallback = (iframeEl: HTMLIFrameElement) => void

export interface IframesController {
  addIframe: IFrameCallback
  removeIframe: IFrameCallback
  stop: () => void
  flush: () => void
}

export const initIframeController = (
  configuration: RumConfiguration,
  {
    mutationCb,
  }: {
    mutationCb: MutationCallBack
  }
): IframesController => {
  const controllerByIframe = new Map<HTMLIFrameElement, IframeController>()

  const shadowRootsController = initShadowRootsController(configuration, { mutationCb, inputCb: noop })

  const iframesController: IframesController = {
    addIframe: (iframeEl: HTMLIFrameElement) => {
      if (!iframeEl.contentDocument) {
        return
      }
      const { stop: stopMutationObserver, flush } = startMutationObserver(
        mutationCb,
        configuration,
        shadowRootsController,
        iframesController,
        iframeEl.contentDocument
      )
      controllerByIframe.set(iframeEl, {
        flush,
        stop: () => {
          stopMutationObserver()
        },
      })
    },
    removeIframe: (iframeEl: HTMLIFrameElement) => {
      const entry = controllerByIframe.get(iframeEl)
      if (!entry) {
        return
      }
      entry.stop()
      controllerByIframe.delete(iframeEl)
    },
    stop: () => {
      shadowRootsController.stop()
      controllerByIframe.forEach(({ stop }) => stop())
    },
    flush: () => {
      shadowRootsController.flush()
      controllerByIframe.forEach(({ flush }) => flush())
    },
  }
  return iframesController
}
