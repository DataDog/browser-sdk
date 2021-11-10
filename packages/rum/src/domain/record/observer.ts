import {
  monitor,
  callMonitored,
  throttle,
  DOM_EVENT,
  addEventListeners,
  addEventListener,
  includes,
  DefaultPrivacyLevel,
  isExperimentalFeatureEnabled,
  noop,
} from '@datadog/browser-core'
import { NodePrivacyLevel } from '../../constants'
import { getNodePrivacyLevel, shouldMaskNode } from './privacy'
import { getElementInputValue, getSerializedNodeId, hasSerializedNode } from './serializationUtils'
import {
  FocusCallback,
  HookResetter,
  IncrementalSource,
  InputCallback,
  InputState,
  ListenerHandler,
  MediaInteractionCallback,
  MediaInteractions,
  MouseInteractionCallBack,
  MouseInteractions,
  MousemoveCallBack,
  MutationCallBack,
  ObserverParam,
  ScrollCallback,
  StyleSheetRuleCallback,
  ViewportResizeCallback,
  VisualViewportResizeCallback,
  MousePosition,
  MouseInteractionParam,
} from './types'
import { forEach, hookSetter, isTouchEvent } from './utils'
import { startMutationObserver, MutationController } from './mutationObserver'

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

  const visualViewportResizeHandler = isExperimentalFeatureEnabled('visualviewport')
    ? initVisualViewportResizeObserver(o.visualViewportResizeCb)
    : noop

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
        if (isExperimentalFeatureEnabled('visualviewport') && window.visualViewport) {
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
  [DOM_EVENT.MOUSE_UP]: MouseInteractions.MouseUp,
  [DOM_EVENT.MOUSE_DOWN]: MouseInteractions.MouseDown,
  [DOM_EVENT.CLICK]: MouseInteractions.Click,
  [DOM_EVENT.CONTEXT_MENU]: MouseInteractions.ContextMenu,
  [DOM_EVENT.DBL_CLICK]: MouseInteractions.DblClick,
  [DOM_EVENT.FOCUS]: MouseInteractions.Focus,
  [DOM_EVENT.BLUR]: MouseInteractions.Blur,
  [DOM_EVENT.TOUCH_START]: MouseInteractions.TouchStart,
  [DOM_EVENT.TOUCH_END]: MouseInteractions.TouchEnd,
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
    const position: MouseInteractionParam = {
      id: getSerializedNodeId(target),
      type: eventTypeToMouseInteraction[event.type as keyof typeof eventTypeToMouseInteraction],
      x: clientX,
      y: clientY,
    }
    if (isExperimentalFeatureEnabled('visualviewport') && window.visualViewport) {
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
        if (isExperimentalFeatureEnabled('visualviewport')) {
          cb({
            id,
            x: getScrollX(),
            y: getScrollY(),
          })
        } else {
          const scrollEl = (document.scrollingElement || document.documentElement)!
          cb({
            id,
            x: scrollEl.scrollLeft,
            y: scrollEl.scrollTop,
          })
        }
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

export const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']
const lastInputStateMap: WeakMap<EventTarget, InputState> = new WeakMap()
export function initInputObserver(cb: InputCallback, defaultPrivacyLevel: DefaultPrivacyLevel): ListenerHandler {
  function eventHandler(event: { target: EventTarget | null }) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement
    const nodePrivacyLevel = getNodePrivacyLevel(target, defaultPrivacyLevel)
    if (
      !target ||
      !target.tagName ||
      !includes(INPUT_TAGS, target.tagName) ||
      nodePrivacyLevel === NodePrivacyLevel.HIDDEN
    ) {
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
      cb({
        ...inputState,
        id: getSerializedNodeId(target),
      })
    }
  }

  const { stop: stopEventListeners } = addEventListeners(document, [DOM_EVENT.INPUT, DOM_EVENT.CHANGE], eventHandler, {
    capture: true,
    passive: true,
  })

  const propertyDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  const hookProperties: Array<[HTMLElement, string]> = [
    [HTMLInputElement.prototype, 'value'],
    [HTMLInputElement.prototype, 'checked'],
    [HTMLSelectElement.prototype, 'value'],
    [HTMLTextAreaElement.prototype, 'value'],
    // Some UI library use selectedIndex to set select value
    [HTMLSelectElement.prototype, 'selectedIndex'],
  ]

  const hookResetters: HookResetter[] = []
  if (propertyDescriptor && propertyDescriptor.set) {
    hookResetters.push(
      ...hookProperties.map((p) =>
        hookSetter<HTMLElement>(p[0], p[1], {
          set: monitor(function () {
            // mock to a normal event
            eventHandler({ target: this })
          }),
        })
      )
    )
  }

  return () => {
    hookResetters.forEach((h) => h())
    stopEventListeners()
  }
}

function initStyleSheetObserver(cb: StyleSheetRuleCallback): ListenerHandler {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const insertRule = CSSStyleSheet.prototype.insertRule
  CSSStyleSheet.prototype.insertRule = function (this: CSSStyleSheet, rule: string, index?: number) {
    callMonitored(() => {
      if (hasSerializedNode(this.ownerNode!)) {
        cb({
          id: getSerializedNodeId(this.ownerNode),
          adds: [{ rule, index }],
        })
      }
    })
    return insertRule.call(this, rule, index)
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const deleteRule = CSSStyleSheet.prototype.deleteRule
  CSSStyleSheet.prototype.deleteRule = function (this: CSSStyleSheet, index: number) {
    callMonitored(() => {
      if (hasSerializedNode(this.ownerNode!)) {
        cb({
          id: getSerializedNodeId(this.ownerNode),
          removes: [{ index }],
        })
      }
    })
    return deleteRule.call(this, index)
  }

  return () => {
    CSSStyleSheet.prototype.insertRule = insertRule
    CSSStyleSheet.prototype.deleteRule = deleteRule
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
      type: event.type === DOM_EVENT.PLAY ? MediaInteractions.Play : MediaInteractions.Pause,
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
