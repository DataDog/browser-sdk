import { throttle, DOM_EVENT, addEventListeners, noop } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration } from '@datadog/browser-rum-core'
import { initViewportObservable, ActionType, RumEventType, LifeCycleEventType } from '@datadog/browser-rum-core'
import type {
  BrowserMutationPayload,
  ViewportResizeDimension,
  FocusRecord,
  VisualViewportRecord,
  FrustrationRecord,
} from '../../../types'
import { RecordType } from '../../../types'
import type { ListenerHandler } from '../utils'
import { getRecordIdForEvent } from '../utils'
import { getVisualViewport } from '../viewports'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import type { ShadowRootsController } from '../shadowRootsController'
import { startMutationObserver } from './mutationObserver'
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

const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

export type MutationCallBack = (m: BrowserMutationPayload) => void

type ViewportResizeCallback = (d: ViewportResizeDimension) => void

type FocusCallback = (data: FocusRecord['data']) => void

type VisualViewportResizeCallback = (data: VisualViewportRecord['data']) => void

export type FrustrationCallback = (record: FrustrationRecord) => void

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
  const mutationHandler = initMutationObserver(o.mutationCb, o.configuration, o.shadowRootsController)
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

export function initMutationObserver(
  cb: MutationCallBack,
  configuration: RumConfiguration,
  shadowRootsController: ShadowRootsController
) {
  return startMutationObserver(cb, configuration, shadowRootsController, document)
}

function initViewportResizeObserver(cb: ViewportResizeCallback): ListenerHandler {
  return initViewportObservable().subscribe(cb).unsubscribe
}

function initFocusObserver(focusCb: FocusCallback): ListenerHandler {
  return addEventListeners(window, [DOM_EVENT.FOCUS, DOM_EVENT.BLUR], () => {
    focusCb({ has_focus: document.hasFocus() })
  }).stop
}

function initVisualViewportResizeObserver(cb: VisualViewportResizeCallback): ListenerHandler {
  if (!window.visualViewport) {
    return noop
  }
  const { throttled: updateDimension, cancel: cancelThrottle } = throttle(
    () => {
      cb(getVisualViewport())
    },
    VISUAL_VIEWPORT_OBSERVER_THRESHOLD,
    {
      trailing: false,
    }
  )
  const removeListener = addEventListeners(
    window.visualViewport,
    [DOM_EVENT.RESIZE, DOM_EVENT.SCROLL],
    updateDimension,
    {
      capture: true,
      passive: true,
    }
  ).stop

  return function stop() {
    removeListener()
    cancelThrottle()
  }
}

export function initFrustrationObserver(lifeCycle: LifeCycle, frustrationCb: FrustrationCallback): ListenerHandler {
  return lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
    if (
      data.rawRumEvent.type === RumEventType.ACTION &&
      data.rawRumEvent.action.type === ActionType.CLICK &&
      data.rawRumEvent.action.frustration?.type?.length &&
      'events' in data.domainContext &&
      data.domainContext.events?.length
    ) {
      frustrationCb({
        timestamp: data.rawRumEvent.date,
        type: RecordType.FrustrationRecord,
        data: {
          frustrationTypes: data.rawRumEvent.action.frustration.type,
          recordIds: data.domainContext.events.map((e) => getRecordIdForEvent(e)),
        },
      })
    }
  }).unsubscribe
}
