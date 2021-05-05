import { monitor, callMonitored, throttle, DOM_EVENT, addEventListeners, addEventListener } from '@datadog/browser-core'
import { getSerializedNodeId, hasSerializedNode } from '../rrweb-snapshot'
import { nodeOrAncestorsShouldBeHidden, nodeOrAncestorsShouldHaveInputIgnored } from '../privacy'
import { MutationObserverWrapper, MutationController } from './mutation'
import {
  FocusCallback,
  HookResetter,
  IncrementalSource,
  InputCallback,
  InputValue,
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
} from './types'
import { forEach, getWindowHeight, getWindowWidth, hookSetter, isTouchEvent } from './utils'
import { startMutationObserver } from './mutationObserver'

const MOUSE_MOVE_OBSERVER_THRESHOLD = 50
const SCROLL_OBSERVER_THRESHOLD = 100

export function initObservers(o: ObserverParam): ListenerHandler {
  const mutationHandler = initMutationObserver(o.useNewMutationObserver, o.mutationController, o.mutationCb)
  const mousemoveHandler = initMoveObserver(o.mousemoveCb)
  const mouseInteractionHandler = initMouseInteractionObserver(o.mouseInteractionCb)
  const scrollHandler = initScrollObserver(o.scrollCb)
  const viewportResizeHandler = initViewportResizeObserver(o.viewportResizeCb)
  const inputHandler = initInputObserver(o.inputCb)
  const mediaInteractionHandler = initMediaInteractionObserver(o.mediaInteractionCb)
  const styleSheetObserver = initStyleSheetObserver(o.styleSheetRuleCb)
  const focusHandler = initFocusObserver(o.focusCb)

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
  }
}

function initMutationObserver(
  useNewMutationObserver: boolean,
  mutationController: MutationController,
  cb: MutationCallBack
) {
  if (useNewMutationObserver) {
    return startMutationObserver(mutationController, cb).stop
  }
  const mutationObserverWrapper = new MutationObserverWrapper(mutationController, cb)
  return () => mutationObserverWrapper.stop()
}

function initMoveObserver(cb: MousemoveCallBack): ListenerHandler {
  const { throttled: updatePosition } = throttle(
    monitor((event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (hasSerializedNode(target)) {
        const { clientX, clientY } = isTouchEvent(event) ? event.changedTouches[0] : event
        const position = {
          id: getSerializedNodeId(target),
          timeOffset: 0,
          x: clientX,
          y: clientY,
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
function initMouseInteractionObserver(cb: MouseInteractionCallBack): ListenerHandler {
  const handler = (event: MouseEvent | TouchEvent) => {
    const target = event.target as Node
    if (nodeOrAncestorsShouldBeHidden(target) || !hasSerializedNode(target)) {
      return
    }
    const { clientX, clientY } = isTouchEvent(event) ? event.changedTouches[0] : event
    cb({
      id: getSerializedNodeId(target),
      type: eventTypeToMouseInteraction[event.type as keyof typeof eventTypeToMouseInteraction],
      x: clientX,
      y: clientY,
    })
  }
  return addEventListeners(document, Object.keys(eventTypeToMouseInteraction) as DOM_EVENT[], handler, {
    capture: true,
    passive: true,
  }).stop
}

function initScrollObserver(cb: ScrollCallback): ListenerHandler {
  const { throttled: updatePosition } = throttle(
    monitor((event: UIEvent) => {
      const target = event.target as HTMLElement | Document
      if (!target || nodeOrAncestorsShouldBeHidden(target) || !hasSerializedNode(target)) {
        return
      }
      const id = getSerializedNodeId(target)
      if (target === document) {
        const scrollEl = (document.scrollingElement || document.documentElement)!
        cb({
          id,
          x: scrollEl.scrollLeft,
          y: scrollEl.scrollTop,
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

export const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']
const lastInputValueMap: WeakMap<EventTarget, InputValue> = new WeakMap()
function initInputObserver(cb: InputCallback): ListenerHandler {
  function eventHandler(event: { target: EventTarget | null }) {
    const target = event.target as Node

    if (
      !target ||
      !(target as Element).tagName ||
      INPUT_TAGS.indexOf((target as Element).tagName) < 0 ||
      nodeOrAncestorsShouldBeHidden(target) ||
      nodeOrAncestorsShouldHaveInputIgnored(target)
    ) {
      return
    }

    const type: string | undefined = (target as HTMLInputElement).type
    const text = (target as HTMLInputElement).value
    let isChecked = false

    if (type === 'radio' || type === 'checkbox') {
      isChecked = (target as HTMLInputElement).checked
    }

    cbWithDedup(target, { text, isChecked })

    // if a radio was checked
    // the other radios with the same name attribute will be unchecked.
    const name: string | undefined = (target as HTMLInputElement).name
    if (type === 'radio' && name && isChecked) {
      forEach(document.querySelectorAll(`input[type="radio"][name="${name}"]`), (el: Element) => {
        if (el !== target) {
          cbWithDedup(el, {
            isChecked: !isChecked,
            text: (el as HTMLInputElement).value,
          })
        }
      })
    }
  }

  function cbWithDedup(target: Node, v: InputValue) {
    if (!hasSerializedNode(target)) {
      return
    }
    const lastInputValue = lastInputValueMap.get(target)
    if (!lastInputValue || lastInputValue.text !== v.text || lastInputValue.isChecked !== v.isChecked) {
      lastInputValueMap.set(target, v)
      cb({
        ...v,
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

function initMediaInteractionObserver(mediaInteractionCb: MediaInteractionCallback): ListenerHandler {
  const handler = (event: Event) => {
    const target = event.target as Node
    if (!target || nodeOrAncestorsShouldBeHidden(target) || !hasSerializedNode(target)) {
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
