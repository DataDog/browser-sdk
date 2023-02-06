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
  addTelemetryDebug,
} from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration } from '@datadog/browser-rum-core'
import {
  isNodeShadowHost,
  initViewportObservable,
  ActionType,
  RumEventType,
  LifeCycleEventType,
} from '@datadog/browser-rum-core'
import { NodePrivacyLevel } from '../../constants'
import type {
  InputState,
  MousePosition,
  MouseInteraction,
  BrowserMutationPayload,
  ScrollPosition,
  StyleSheetRule,
  ViewportResizeDimension,
  MediaInteraction,
  FocusRecord,
  VisualViewportRecord,
  FrustrationRecord,
  BrowserIncrementalSnapshotRecord,
  MouseInteractionData,
} from '../../types'
import { RecordType, IncrementalSource, MediaInteractionType, MouseInteractionType } from '../../types'
import { getNodePrivacyLevel, shouldMaskNode } from './privacy'
import { getElementInputValue, getSerializedNodeId, hasSerializedNode } from './serializationUtils'
import { assembleIncrementalSnapshot, forEach, getPathToNestedCSSRule, isTouchEvent } from './utils'
import { startMutationObserver } from './mutationObserver'
import { getVisualViewport, getScrollX, getScrollY, convertMouseEventToLayoutCoordinates } from './viewports'
import type { ElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'

const MOUSE_MOVE_OBSERVER_THRESHOLD = 50
const SCROLL_OBSERVER_THRESHOLD = 100
const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

const recordIds = new WeakMap<Event, number>()
let nextId = 1

export function getRecordIdForEvent(event: Event): number {
  if (!recordIds.has(event)) {
    recordIds.set(event, nextId++)
  }
  return recordIds.get(event)!
}

type GroupingCSSRuleTypes = typeof CSSGroupingRule | typeof CSSMediaRule | typeof CSSSupportsRule

type ListenerHandler = () => void

export type MousemoveCallBack = (
  p: MousePosition[],
  source: typeof IncrementalSource.MouseMove | typeof IncrementalSource.TouchMove
) => void

export type MutationCallBack = (m: BrowserMutationPayload) => void

export type MouseInteractionCallBack = (record: BrowserIncrementalSnapshotRecord) => void

type ScrollCallback = (p: ScrollPosition) => void

export type StyleSheetCallback = (s: StyleSheetRule) => void

type ViewportResizeCallback = (d: ViewportResizeDimension) => void

export type InputCallback = (v: InputState & { id: number }) => void

type MediaInteractionCallback = (p: MediaInteraction) => void

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

export function initMoveObserver(cb: MousemoveCallBack): ListenerHandler {
  const { throttled: updatePosition } = throttle(
    monitor((event: MouseEvent | TouchEvent) => {
      const target = getEventTarget(event)
      if (hasSerializedNode(target)) {
        const coordinates = tryToComputeCoordinates(event)
        if (!coordinates) {
          return
        }
        const position: MousePosition = {
          id: getSerializedNodeId(target),
          timeOffset: 0,
          x: coordinates.x,
          y: coordinates.y,
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
  // Listen for pointerup DOM events instead of mouseup for MouseInteraction/MouseUp records. This
  // allows to reference such records from Frustration records.
  //
  // In the context of supporting Mobile Session Replay, we introduced `PointerInteraction` records
  // used by the Mobile SDKs in place of `MouseInteraction`. In the future, we should replace
  // `MouseInteraction` by `PointerInteraction` in the Browser SDK so we have an uniform way to
  // convey such interaction. This would cleanly solve the issue since we would have
  // `PointerInteraction/Up` records that we could reference from `Frustration` records.
  [DOM_EVENT.POINTER_UP]: MouseInteractionType.MouseUp,

  [DOM_EVENT.MOUSE_DOWN]: MouseInteractionType.MouseDown,
  [DOM_EVENT.CLICK]: MouseInteractionType.Click,
  [DOM_EVENT.CONTEXT_MENU]: MouseInteractionType.ContextMenu,
  [DOM_EVENT.DBL_CLICK]: MouseInteractionType.DblClick,
  [DOM_EVENT.FOCUS]: MouseInteractionType.Focus,
  [DOM_EVENT.BLUR]: MouseInteractionType.Blur,
  [DOM_EVENT.TOUCH_START]: MouseInteractionType.TouchStart,
  [DOM_EVENT.TOUCH_END]: MouseInteractionType.TouchEnd,
}
export function initMouseInteractionObserver(
  cb: MouseInteractionCallBack,
  defaultPrivacyLevel: DefaultPrivacyLevel
): ListenerHandler {
  const handler = (event: MouseEvent | TouchEvent) => {
    const target = getEventTarget(event)
    if (getNodePrivacyLevel(target, defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN || !hasSerializedNode(target)) {
      return
    }
    const id = getSerializedNodeId(target)
    const type = eventTypeToMouseInteraction[event.type as keyof typeof eventTypeToMouseInteraction]

    let interaction: MouseInteraction
    if (type !== MouseInteractionType.Blur && type !== MouseInteractionType.Focus) {
      const coordinates = tryToComputeCoordinates(event)
      if (!coordinates) {
        return
      }
      interaction = { id, type, x: coordinates.x, y: coordinates.y }
    } else {
      interaction = { id, type }
    }

    const record = assign(
      { id: getRecordIdForEvent(event) },
      assembleIncrementalSnapshot<MouseInteractionData>(IncrementalSource.MouseInteraction, interaction)
    )
    cb(record)
  }
  return addEventListeners(document, Object.keys(eventTypeToMouseInteraction) as DOM_EVENT[], handler, {
    capture: true,
    passive: true,
  }).stop
}

function tryToComputeCoordinates(event: MouseEvent | TouchEvent) {
  let { clientX: x, clientY: y } = isTouchEvent(event) ? event.changedTouches[0] : event
  if (window.visualViewport) {
    const { visualViewportX, visualViewportY } = convertMouseEventToLayoutCoordinates(x, y)
    x = visualViewportX
    y = visualViewportY
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (event.isTrusted) {
      addTelemetryDebug('mouse/touch event without x/y')
    }
    return undefined
  }
  return { x, y }
}

function initScrollObserver(
  cb: ScrollCallback,
  defaultPrivacyLevel: DefaultPrivacyLevel,
  elementsScrollPositions: ElementsScrollPositions
): ListenerHandler {
  const { throttled: updatePosition } = throttle(
    monitor((event: UIEvent) => {
      const target = getEventTarget(event) as HTMLElement | Document
      if (
        !target ||
        getNodePrivacyLevel(target, defaultPrivacyLevel) === NodePrivacyLevel.HIDDEN ||
        !hasSerializedNode(target)
      ) {
        return
      }
      const id = getSerializedNodeId(target)
      const scrollPositions =
        target === document
          ? {
              scrollTop: getScrollY(),
              scrollLeft: getScrollX(),
            }
          : {
              scrollTop: Math.round((target as HTMLElement).scrollTop),
              scrollLeft: Math.round((target as HTMLElement).scrollLeft),
            }
      elementsScrollPositions.set(target, scrollPositions)
      cb({
        id,
        x: scrollPositions.scrollLeft,
        y: scrollPositions.scrollTop,
      })
    }),
    SCROLL_OBSERVER_THRESHOLD
  )
  return addEventListener(document, DOM_EVENT.SCROLL, updatePosition, { capture: true, passive: true }).stop
}

function initViewportResizeObserver(cb: ViewportResizeCallback): ListenerHandler {
  return initViewportObservable().subscribe(cb).unsubscribe
}

type InputObserverOptions = {
  domEvents?: Array<DOM_EVENT.INPUT | DOM_EVENT.CHANGE>
  target?: Node
}
export function initInputObserver(
  cb: InputCallback,
  defaultPrivacyLevel: DefaultPrivacyLevel,
  { domEvents = [DOM_EVENT.INPUT, DOM_EVENT.CHANGE], target = document }: InputObserverOptions = {}
): ListenerHandler {
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
    target,
    domEvents,
    (event) => {
      const target = getEventTarget(event)
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        onElementChange(target)
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

export function initStyleSheetObserver(cb: StyleSheetCallback): ListenerHandler {
  function checkStyleSheetAndCallback(styleSheet: CSSStyleSheet | null, callback: (id: number) => void): void {
    if (styleSheet && hasSerializedNode(styleSheet.ownerNode!)) {
      callback(getSerializedNodeId(styleSheet.ownerNode))
    }
  }

  const instrumentationStoppers = [
    instrumentMethodAndCallOriginal(CSSStyleSheet.prototype, 'insertRule', {
      before(rule, index) {
        checkStyleSheetAndCallback(this, (id) => cb({ id, adds: [{ rule, index }] }))
      },
    }),
    instrumentMethodAndCallOriginal(CSSStyleSheet.prototype, 'deleteRule', {
      before(index) {
        checkStyleSheetAndCallback(this, (id) => cb({ id, removes: [{ index }] }))
      },
    }),
  ]

  if (typeof CSSGroupingRule !== 'undefined') {
    instrumentGroupingCSSRuleClass(CSSGroupingRule)
  } else {
    instrumentGroupingCSSRuleClass(CSSMediaRule)
    instrumentGroupingCSSRuleClass(CSSSupportsRule)
  }

  function instrumentGroupingCSSRuleClass(cls: GroupingCSSRuleTypes) {
    instrumentationStoppers.push(
      instrumentMethodAndCallOriginal(cls.prototype, 'insertRule', {
        before(rule, index) {
          checkStyleSheetAndCallback(this.parentStyleSheet, (id) => {
            const path = getPathToNestedCSSRule(this)
            if (path) {
              path.push(index || 0)
              cb({ id, adds: [{ rule, index: path }] })
            }
          })
        },
      }),
      instrumentMethodAndCallOriginal(cls.prototype, 'deleteRule', {
        before(index) {
          checkStyleSheetAndCallback(this.parentStyleSheet, (id) => {
            const path = getPathToNestedCSSRule(this)
            if (path) {
              path.push(index)
              cb({ id, removes: [{ index: path }] })
            }
          })
        },
      })
    )
  }

  return () => instrumentationStoppers.forEach((stopper) => stopper.stop())
}

function initMediaInteractionObserver(
  mediaInteractionCb: MediaInteractionCallback,
  defaultPrivacyLevel: DefaultPrivacyLevel
): ListenerHandler {
  const handler = (event: Event) => {
    const target = getEventTarget(event)
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

function getEventTarget(event: Event): Node {
  if (event.composed === true && isNodeShadowHost(event.target as Node)) {
    return event.composedPath()[0] as Node
  }
  return event.target as Node
}
