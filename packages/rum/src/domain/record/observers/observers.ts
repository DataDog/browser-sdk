import type { ListenerHandler } from '@datadog/browser-core'
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
import { initRecordIds } from './recordIds'
import { initViewEndObserver, type ViewEndCallback } from './viewEndObserver'

interface ObserverParam {
  lifeCycle: LifeCycle
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
  viewEndCb: ViewEndCallback
  shadowRootsController: ShadowRootsController
}

export function initObservers(
  configuration: RumConfiguration,
  o: ObserverParam
): { stop: ListenerHandler; flush: ListenerHandler } {
  const recordIds = initRecordIds()
  const mutationHandler = initMutationObserver(o.mutationCb, configuration, o.shadowRootsController, document)
  const mousemoveHandler = initMoveObserver(configuration, o.mousemoveCb)
  const mouseInteractionHandler = initMouseInteractionObserver(configuration, o.mouseInteractionCb, recordIds)
  const scrollHandler = initScrollObserver(configuration, o.scrollCb, o.elementsScrollPositions)
  const viewportResizeHandler = initViewportResizeObserver(configuration, o.viewportResizeCb)
  const inputHandler = initInputObserver(configuration, o.inputCb)
  const mediaInteractionHandler = initMediaInteractionObserver(configuration, o.mediaInteractionCb)
  const styleSheetObserver = initStyleSheetObserver(o.styleSheetCb)
  const focusHandler = initFocusObserver(configuration, o.focusCb)
  const visualViewportResizeHandler = initVisualViewportResizeObserver(configuration, o.visualViewportResizeCb)
  const frustrationHandler = initFrustrationObserver(o.lifeCycle, o.frustrationCb, recordIds)
  const viewEndHandler = initViewEndObserver(o.lifeCycle, o.viewEndCb)

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
      viewEndHandler()
    },
  }
}
