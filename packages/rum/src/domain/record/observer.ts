import type { DefaultPrivacyLevel } from '@datadog/browser-core'
import {
  instrumentSetter,
  instrumentMethodAndCallOriginal,
  assign,
  monitor,
  throttle,
  DOM_EVENT,
  addEventListeners,
  addEventListener,
  noop,
} from '@datadog/browser-core'
import { NodePrivacyLevel } from '../../constants'
import type {
  InputState,
  MousePosition,
  MouseInteraction,
  MutationPayload,
  ScrollPosition,
  StyleSheetRule,
  ViewportResizeDimension,
  MediaInteraction,
  FocusRecord,
  VisualViewportRecord,
} from '../../types'
import { IncrementalSource, MediaInteractionType, MouseInteractionType } from '../../types'
import { getNodePrivacyLevel, shouldMaskNode } from './privacy'
import { getElementInputValue, getSerializedNodeId, hasSerializedNode } from './serializationUtils'
import { forEach, isTouchEvent } from './utils'
import type { MutationController } from './mutationObserver'
import { startMutationObserver } from './mutationObserver'

import {
  getVisualViewport,
  getWindowHeight,
  getWindowWidth,
  getScrollX,
  getScrollY,
  convertMouseEventToLayoutCoordinates,
} from './viewports'

const MOUSE_MOVE_OBSERVER_THRESHOLD = 50
const SCROLL_OBSERVER_THRESHOLD = 100
const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

type ListenerHandler = () => void

type MousemoveCallBack = (
  p: MousePosition[],
  source: typeof IncrementalSource.MouseMove | typeof IncrementalSource.TouchMove
) => void

export type MutationCallBack = (m: MutationPayload) => void

type MouseInteractionCallBack = (d: MouseInteraction) => void

type ScrollCallback = (p: ScrollPosition) => void

type StyleSheetRuleCallback = (s: StyleSheetRule) => void

type ViewportResizeCallback = (d: ViewportResizeDimension) => void

export type InputCallback = (v: InputState & { id: number }) => void

type MediaInteractionCallback = (p: MediaInteraction) => void

type FocusCallback = (data: FocusRecord['data']) => void

type VisualViewportResizeCallback = (data: VisualViewportRecord['data']) => void

interface ObserverParam {
  defaultPrivacyLevel: DefaultPrivacyLevel
  mutationController: MutationController
  mutationCb: MutationCallBack
  mousemoveCb: MousemoveCallBack
  mouseInteractionCb: MouseInteractionCallBack
  scrollCb: ScrollCallback
  viewportResizeCb: ViewportResizeCallback
  visualViewportResizeCb: VisualViewportResizeCallback
  inputCb: InputCallback
  mediaInteractionCb: MediaInteractionCallback
  styleSheetRuleCb: StyleSheetRuleCallback
  focusCb: FocusCallback
}

export function initObservers(o: ObserverParam): ListenerHandler {
  const mutationHandler = initMutationObserver(o.mutationController, o.mutationCb, o.defaultPrivacyLevel)
  const mousemoveHandler = initMoveObserver(o.mousemoveCb)
  const mouseInteractionHandler = initMouseInteractionObserver(o.mouseInteractionCb, o.defaultPrivacyLevel)
  const scrollHandler = initScrollObserver(o.scrollCb, o.defaultPrivacyLevel)
  const viewportResizeHandler = initViewportResizeObserver(o.viewportResizeCb)
  const inputHandler = initInputObserver(o.inputCb, o.defaultPrivacyLevel)
  const mediaInteractionHandler = initMediaInteractionObserver(o.mediaInteractionCb, o.defaultPrivacyLevel)
  const styleSheetObserver = initStyleSheetObserver(o.styleSheetRuleCb)
  const focusHandler = initFocusObserver(o.focusCb)
  const visualViewportResizeHandler = initVisualViewportResizeObserver(o.visualViewportResizeCb)

  return () => {
    mutationHandler()
    mousemoveHandler()
    mouseInteractionHandler()
    scrollHandler()
    viewportResizeHandler()
    inputHandler()
    mediaInteractionHandler()
    styleSheetObserver()
    focusHandler()
    visualViewportResizeHandler()
  }
}

function initMutationObserver(
  mutationController: MutationController,
  cb: MutationCallBack,
  defaultPrivacyLevel: DefaultPrivacyLevel
) {
  return startMutationObserver(mutationController, cb, defaultPrivacyLevel).stop
}

function initMoveObserver(cb: MousemoveCallBack): ListenerHandler {
  const { throttled: updatePosition } = throttle(
    monitor((event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (hasSerializedNode(target)) {
        const { clientX, clientY } = isTouchEvent(event) ? event.changedTouches[0] : event
        const position: MousePosition = {
          id: getSerializedNodeId(target),
          timeOffset: 0,
          x: clientX,
          y: clientY,
        }
        if (window.visualViewport) {
          const { visualViewportX, visualViewportY } = convertMouseEventToLayoutCoordinates(clientX, clientY)
          position.x = visualViewportX
          position.y = visualViewportY
        }
        cb([position], isTouchEvent(event) ? IncrementalSource.TouchMove : IncrementalSource.MouseMove)
      }
    }),
    MOUSE_MOVE_OBSERVER_THRESHOLD,
    {
      trailing: false,
    }
  )

  return addEventListeners(document, [DOM_EVENT.MOUSE_MOVE, DOM_EVENT.TOUCH_MOVE], updatePosition, {
    capture: true,
    passive: true,
  }).stop
}

const eventTypeToMouseInteraction = {
  [DOM_EVENT.MOUSE_UP]: MouseInteractionType.MouseUp,
  [DOM_EVENT.MOUSE_DOWN]: MouseInteractionType.MouseDown,
  [DOM_EVENT.CLICK]: MouseInteractionType.Click,
  [DOM_EVENT.CONTEXT_MENU]: MouseInteractionType.ContextMenu,
  [DOM_EVENT.DBL_CLICK]: MouseInteractionType.DblClick,
  [DOM_EVENT.FOCUS]: MouseInteractionType.Focus,
  [DOM_EVENT.BLUR]: MouseInteractionType.Blur,
  [DOM_EVENT.TOUCH_START]: MouseInteractionType.TouchStart,
  [DOM_EVENT.TOUCH_END]: MouseInteractionType.TouchEnd,
}
function initMouseInteractionObserver(
  cb: MouseInteractionCallBack,
  defaultPrivacyLevel: DefaultPrivacyLevel
): ListenerHandler {
  const handler = (event: MouseEvent | TouchEvent) => {
    const target = event.target as Node
    if (getNodePrivacyLevel(target, defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN || !hasSerializedNode(target)) {
      return
    }
    const { clientX, clientY } = isTouchEvent(event) ? event.changedTouches[0] : event
    const position: MouseInteraction = {
      id: getSerializedNodeId(target),
      type: eventTypeToMouseInteraction[event.type as keyof typeof eventTypeToMouseInteraction],
      x: clientX,
      y: clientY,
    }
    if (window.visualViewport) {
      const { visualViewportX, visualViewportY } = convertMouseEventToLayoutCoordinates(clientX, clientY)
      position.x = visualViewportX
      position.y = visualViewportY
    }
    cb(position)
  }
  return addEventListeners(document, Object.keys(eventTypeToMouseInteraction) as DOM_EVENT[], handler, {
    capture: true,
    passive: true,
  }).stop
}

function initScrollObserver(cb: ScrollCallback, defaultPrivacyLevel: DefaultPrivacyLevel): ListenerHandler {
  const { throttled: updatePosition } = throttle(
    monitor((event: UIEvent) => {
      const target = event.target as HTMLElement | Document
      if (
        !target ||
        getNodePrivacyLevel(target, defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN ||
        !hasSerializedNode(target)
      ) {
        return
      }
      const id = getSerializedNodeId(target)
      if (target === document) {
        cb({
          id,
          x: getScrollX(),
          y: getScrollY(),
        })
      } else {
        cb({
          id,
          x: (target as HTMLElement).scrollLeft,
          y: (target as HTMLElement).scrollTop,
        })
      }
    }),
    SCROLL_OBSERVER_THRESHOLD
  )
  return addEventListener(document, DOM_EVENT.SCROLL, updatePosition, { capture: true, passive: true }).stop
}

function initViewportResizeObserver(cb: ViewportResizeCallback): ListenerHandler {
  const { throttled: updateDimension } = throttle(
    monitor(() => {
      const height = getWindowHeight()
      const width = getWindowWidth()
      cb({
        height: Number(height),
        width: Number(width),
      })
    }),
    200
  )
  return addEventListener(window, DOM_EVENT.RESIZE, updateDimension, { capture: true, passive: true }).stop
}

export function initInputObserver(cb: InputCallback, defaultPrivacyLevel: DefaultPrivacyLevel): ListenerHandler {
  const lastInputStateMap: WeakMap<Node, InputState> = new WeakMap()

  function onElementChange(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
    const nodePrivacyLevel = getNodePrivacyLevel(target, defaultPrivacyLevel)
    if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
      return
    }

    const type = target.type

    let inputState: InputState
    if (type === 'radio' || type === 'checkbox') {
      if (shouldMaskNode(target, nodePrivacyLevel)) {
        return
      }
      inputState = { isChecked: (target as HTMLInputElement).checked }
    } else {
      const value = getElementInputValue(target, nodePrivacyLevel)
      if (value === undefined) {
        return
      }
      inputState = { text: value }
    }

    // Can be multiple changes on the same node within the same batched mutation observation.
    cbWithDedup(target, inputState)

    // If a radio was checked, other radios with the same name attribute will be unchecked.
    const name = target.name
    if (type === 'radio' && name && (target as HTMLInputElement).checked) {
      forEach(document.querySelectorAll(`input[type="radio"][name="${name}"]`), (el: Element) => {
        if (el !== target) {
          // TODO: Consider the privacy implications for various differing input privacy levels
          cbWithDedup(el, { isChecked: false })
        }
      })
    }
  }

  /**
   * There can be multiple changes on the same node within the same batched mutation observation.
   */
  function cbWithDedup(target: Node, inputState: InputState) {
    if (!hasSerializedNode(target)) {
      return
    }
    const lastInputState = lastInputStateMap.get(target)
    if (
      !lastInputState ||
      (lastInputState as { text?: string }).text !== (inputState as { text?: string }).text ||
      (lastInputState as { isChecked?: boolean }).isChecked !== (inputState as { isChecked?: boolean }).isChecked
    ) {
      lastInputStateMap.set(target, inputState)
      cb(
        assign(
          {
            id: getSerializedNodeId(target),
          },
          inputState
        )
      )
    }
  }

  const { stop: stopEventListeners } = addEventListeners(
    document,
    [DOM_EVENT.INPUT, DOM_EVENT.CHANGE],
    (event) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        onElementChange(event.target)
      }
    },
    {
      capture: true,
      passive: true,
    }
  )

  const instrumentationStoppers = [
    instrumentSetter(HTMLInputElement.prototype, 'value', onElementChange),
    instrumentSetter(HTMLInputElement.prototype, 'checked', onElementChange),
    instrumentSetter(HTMLSelectElement.prototype, 'value', onElementChange),
    instrumentSetter(HTMLTextAreaElement.prototype, 'value', onElementChange),
    instrumentSetter(HTMLSelectElement.prototype, 'selectedIndex', onElementChange),
  ]

  return () => {
    instrumentationStoppers.forEach((stopper) => stopper.stop())
    stopEventListeners()
  }
}

function initStyleSheetObserver(cb: StyleSheetRuleCallback): ListenerHandler {
  const { stop: restoreInsertRule } = instrumentMethodAndCallOriginal(CSSStyleSheet.prototype, 'insertRule', {
    before(rule, index) {
      if (hasSerializedNode(this.ownerNode!)) {
        cb({
          id: getSerializedNodeId(this.ownerNode),
          adds: [{ rule, index }],
        })
      }
    },
  })

  const { stop: restoreDeleteRule } = instrumentMethodAndCallOriginal(CSSStyleSheet.prototype, 'deleteRule', {
    before(index) {
      if (hasSerializedNode(this.ownerNode!)) {
        cb({
          id: getSerializedNodeId(this.ownerNode),
          removes: [{ index }],
        })
      }
    },
  })

  return () => {
    restoreInsertRule()
    restoreDeleteRule()
  }
}

function initMediaInteractionObserver(
  mediaInteractionCb: MediaInteractionCallback,
  defaultPrivacyLevel: DefaultPrivacyLevel
): ListenerHandler {
  const handler = (event: Event) => {
    const target = event.target as Node
    if (
      !target ||
      getNodePrivacyLevel(target, defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN ||
      !hasSerializedNode(target)
    ) {
      return
    }
    mediaInteractionCb({
      id: getSerializedNodeId(target),
      type: event.type === DOM_EVENT.PLAY ? MediaInteractionType.Play : MediaInteractionType.Pause,
    })
  }
  return addEventListeners(document, [DOM_EVENT.PLAY, DOM_EVENT.PAUSE], handler, { capture: true, passive: true }).stop
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
    monitor(() => {
      cb(getVisualViewport())
    }),
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
