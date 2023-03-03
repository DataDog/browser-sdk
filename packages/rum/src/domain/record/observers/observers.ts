import type { DefaultPrivacyLevel } from '@datadog/browser-core'
import {
  instrumentSetter,
  instrumentMethodAndCallOriginal,
  assign,
  throttle,
  DOM_EVENT,
  addEventListeners,
  noop,
} from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration } from '@datadog/browser-rum-core'
import { initViewportObservable, ActionType, RumEventType, LifeCycleEventType } from '@datadog/browser-rum-core'
import { NodePrivacyLevel } from '../../../constants'
import type {
  InputState,
  BrowserMutationPayload,
  StyleSheetRule,
  ViewportResizeDimension,
  MediaInteraction,
  FocusRecord,
  VisualViewportRecord,
  FrustrationRecord,
} from '../../../types'
import { RecordType, MediaInteractionType } from '../../../types'
import { getNodePrivacyLevel, shouldMaskNode } from '../privacy'
import { getElementInputValue, getSerializedNodeId, hasSerializedNode } from '../serializationUtils'
import type { ListenerHandler } from '../utils'
import { getRecordIdForEvent, getEventTarget, forEach, getPathToNestedCSSRule } from '../utils'
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

const VISUAL_VIEWPORT_OBSERVER_THRESHOLD = 200

type GroupingCSSRuleTypes = typeof CSSGroupingRule | typeof CSSMediaRule | typeof CSSSupportsRule

export type MutationCallBack = (m: BrowserMutationPayload) => void

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
