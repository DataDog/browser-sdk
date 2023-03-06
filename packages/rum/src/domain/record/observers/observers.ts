import type { LifeCycle, RumConfiguration } from '@datadog/browser-rum-core'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import type { ShadowRootsController } from '../shadowRootsController'
import type { MousemoveCallBack } from './moveObserver'
import { initMoveObserver } from './moveObserver'
import type { ScrollCallback } from './scrollObserver'
import { initScrollObserver } from './scrollObserver'
import type { MouseInteractionCallBack } from './mouseInteractionObserver'
import { initMouseInteractionObserver } from './mouseInteractionObserver'
import type { InputCallback } from './inputObserver'
import { initInputObserver } from './inputObserver'
import type { StyleSheetCallback } from './styleSheetObserver'
import { initStyleSheetObserver } from './styleSheetObserver'
import type { MediaInteractionCallback } from './mediaInteractionObserver'
import { initMediaInteractionObserver } from './mediaInteractionObserver'
import type { FrustrationCallback } from './frustrationObserver'
import { initFrustrationObserver } from './frustrationObserver'
import type { ViewportResizeCallback, VisualViewportResizeCallback } from './viewportResizeObserver'
import { initViewportResizeObserver, initVisualViewportResizeObserver } from './viewportResizeObserver'
import type { MutationCallBack } from './mutationObserver'
import { initMutationObserver } from './mutationObserver'
import type { FocusCallback } from './focusObserver'
import { initFocusObserver } from './focusObserver'
import type { ListenerHandler } from './utils'

interface ObserverParam {
  lifeCycle: LifeCycle
  configuration: RumConfiguration
  elementsScrollPositions: ElementsScrollPositions
  mutationCb: MutationCallBack
  mousemoveCb: MousemoveCallBack
  mouseInteractionCb: MouseInteractionCallBack
  scrollCb: ScrollCallback
  viewportResizeCb: ViewportResizeCallback
  visualViewportResizeCb: VisualViewportResizeCallback
  inputCb: InputCallback
  mediaInteractionCb: MediaInteractionCallback
  styleSheetCb: StyleSheetCallback
  focusCb: FocusCallback
  frustrationCb: FrustrationCallback
  shadowRootsController: ShadowRootsController
}

export function initObservers(o: ObserverParam): { stop: ListenerHandler; flush: ListenerHandler } {
  const mutationHandler = initMutationObserver(o.mutationCb, o.configuration, o.shadowRootsController, document)
  const mousemoveHandler = initMoveObserver(o.mousemoveCb)
  const mouseInteractionHandler = initMouseInteractionObserver(
    o.mouseInteractionCb,
    o.configuration.defaultPrivacyLevel
  )
  const scrollHandler = initScrollObserver(o.scrollCb, o.configuration.defaultPrivacyLevel, o.elementsScrollPositions)
  const viewportResizeHandler = initViewportResizeObserver(o.viewportResizeCb)
  const inputHandler = initInputObserver(o.inputCb, o.configuration.defaultPrivacyLevel)
  const mediaInteractionHandler = initMediaInteractionObserver(
    o.mediaInteractionCb,
    o.configuration.defaultPrivacyLevel
  )
  const styleSheetObserver = initStyleSheetObserver(o.styleSheetCb)
  const focusHandler = initFocusObserver(o.focusCb)
  const visualViewportResizeHandler = initVisualViewportResizeObserver(o.visualViewportResizeCb)
  const frustrationHandler = initFrustrationObserver(o.lifeCycle, o.frustrationCb)

  return {
    flush: () => {
      mutationHandler.flush()
    },
    stop: () => {
      mutationHandler.stop()
      mousemoveHandler()
      mouseInteractionHandler()
      scrollHandler()
      viewportResizeHandler()
      inputHandler()
      mediaInteractionHandler()
      styleSheetObserver()
      focusHandler()
      visualViewportResizeHandler()
      frustrationHandler()
    },
  }
}
