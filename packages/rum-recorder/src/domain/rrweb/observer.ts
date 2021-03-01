import {
  noop,
  monitor,
  callMonitored,
  throttle,
  DOM_EVENT,
  addEventListeners,
  addEventListener,
} from '@datadog/browser-core'
import { INode, MaskInputOptions, SlimDOMOptions } from '../rrweb-snapshot'
import { nodeOrAncestorsShouldBeHidden, nodeOrAncestorsShouldHaveInputIgnored } from '../privacy'
import { MutationObserverWrapper, MutationController } from './mutation'
import {
  CanvasMutationCallback,
  FontCallback,
  FontFaceDescriptors,
  FontParam,
  HookResetter,
  IncrementalSource,
  InputCallback,
  InputValue,
  ListenerHandler,
  MaskInputFn,
  MediaInteractionCallback,
  MediaInteractions,
  MouseInteractionCallBack,
  MouseInteractions,
  MousemoveCallBack,
  MutationCallBack,
  ObserverParam,
  SamplingStrategy,
  ScrollCallback,
  StyleSheetRuleCallback,
  ViewportResizeCallback,
} from './types'
import { forEach, getWindowHeight, getWindowWidth, hookSetter, isTouchEvent, mirror, patch } from './utils'

function initMutationObserver(
  mutationController: MutationController,
  cb: MutationCallBack,
  inlineStylesheet: boolean,
  maskInputOptions: MaskInputOptions,
  recordCanvas: boolean,
  slimDOMOptions: SlimDOMOptions
) {
  const mutationObserverWrapper = new MutationObserverWrapper(
    mutationController,
    cb,
    inlineStylesheet,
    maskInputOptions,
    recordCanvas,
    slimDOMOptions
  )
  return () => mutationObserverWrapper.stop()
}

function initMoveObserver(cb: MousemoveCallBack, sampling: SamplingStrategy): ListenerHandler {
  if (sampling.mousemove === false) {
    return noop
  }

  const threshold = typeof sampling.mousemove === 'number' ? sampling.mousemove : 50

  const { throttled: updatePosition } = throttle(
    monitor((evt: MouseEvent | TouchEvent) => {
      const { target } = evt
      const { clientX, clientY } = isTouchEvent(evt) ? evt.changedTouches[0] : evt
      const position = {
        id: mirror.getId(target as INode),
        timeOffset: 0,
        x: clientX,
        y: clientY,
      }
      cb([position], isTouchEvent(evt) ? IncrementalSource.TouchMove : IncrementalSource.MouseMove)
    }),
    threshold,
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
    if (nodeOrAncestorsShouldBeHidden(event.target as Node)) {
      return
    }
    const id = mirror.getId(event.target as INode)
    const { clientX, clientY } = isTouchEvent(event) ? event.changedTouches[0] : event
    cb({
      id,
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

function initScrollObserver(cb: ScrollCallback, sampling: SamplingStrategy): ListenerHandler {
  const { throttled: updatePosition } = throttle(
    monitor((evt: UIEvent) => {
      if (!evt.target || nodeOrAncestorsShouldBeHidden(evt.target as Node)) {
        return
      }
      const id = mirror.getId(evt.target as INode)
      if (evt.target === document) {
        const scrollEl = (document.scrollingElement || document.documentElement)!
        cb({
          id,
          x: scrollEl.scrollLeft,
          y: scrollEl.scrollTop,
        })
      } else {
        cb({
          id,
          x: (evt.target as HTMLElement).scrollLeft,
          y: (evt.target as HTMLElement).scrollTop,
        })
      }
    }),
    sampling.scroll || 100
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
function initInputObserver(
  cb: InputCallback,
  maskInputOptions: MaskInputOptions,
  maskInputFn: MaskInputFn | undefined,
  sampling: SamplingStrategy
): ListenerHandler {
  function eventHandler(event: { target: EventTarget | null }) {
    const { target } = event

    if (
      !target ||
      !(target as Element).tagName ||
      INPUT_TAGS.indexOf((target as Element).tagName) < 0 ||
      nodeOrAncestorsShouldBeHidden(target as Node) ||
      nodeOrAncestorsShouldHaveInputIgnored(target as Node)
    ) {
      return
    }

    const type: string | undefined = (target as HTMLInputElement).type
    let text = (target as HTMLInputElement).value
    let isChecked = false

    if (type === 'radio' || type === 'checkbox') {
      isChecked = (target as HTMLInputElement).checked
    } else if (
      maskInputOptions[(target as Element).tagName.toLowerCase() as keyof MaskInputOptions] ||
      maskInputOptions[type as keyof MaskInputOptions]
    ) {
      text = maskInputFn ? maskInputFn(text) : '*'.repeat(text.length)
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

  function cbWithDedup(target: EventTarget, v: InputValue) {
    const lastInputValue = lastInputValueMap.get(target)
    if (!lastInputValue || lastInputValue.text !== v.text || lastInputValue.isChecked !== v.isChecked) {
      lastInputValueMap.set(target, v)
      const id = mirror.getId(target as INode)
      cb({
        ...v,
        id,
      })
    }
  }

  const events = sampling.input === 'last' ? [DOM_EVENT.CHANGE] : [DOM_EVENT.INPUT, DOM_EVENT.CHANGE]
  const { stop: stopEventListeners } = addEventListeners(document, events, eventHandler, {
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
      const id = mirror.getId((this.ownerNode as unknown) as INode)
      if (id !== -1) {
        cb({
          id,
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
      const id = mirror.getId((this.ownerNode as unknown) as INode)
      if (id !== -1) {
        cb({
          id,
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
    const { target } = event
    if (!target || nodeOrAncestorsShouldBeHidden(target as Node)) {
      return
    }
    mediaInteractionCb({
      id: mirror.getId(target as INode),
      type: event.type === DOM_EVENT.PLAY ? MediaInteractions.Play : MediaInteractions.Pause,
    })
  }
  return addEventListeners(document, [DOM_EVENT.PLAY, DOM_EVENT.PAUSE], handler, { capture: true, passive: true }).stop
}

function initCanvasMutationObserver(cb: CanvasMutationCallback): ListenerHandler {
  const props = Object.getOwnPropertyNames(CanvasRenderingContext2D.prototype)
  const handlers: ListenerHandler[] = []
  for (const prop of props) {
    try {
      if (typeof CanvasRenderingContext2D.prototype[prop as keyof CanvasRenderingContext2D] !== 'function') {
        continue
      }
      const restoreHandler = patch(
        CanvasRenderingContext2D.prototype,
        prop,
        (original: (...args: unknown[]) => unknown) =>
          function (this: CanvasRenderingContext2D, ...args: unknown[]) {
            callMonitored(() => {
              if (!nodeOrAncestorsShouldBeHidden(this.canvas)) {
                setTimeout(
                  monitor(() => {
                    const recordArgs = [...args]
                    if (prop === 'drawImage') {
                      if (recordArgs[0] && recordArgs[0] instanceof HTMLCanvasElement) {
                        recordArgs[0] = recordArgs[0].toDataURL()
                      }
                    }
                    cb({
                      args: recordArgs,
                      id: mirror.getId((this.canvas as unknown) as INode),
                      property: prop,
                    })
                  }),
                  0
                )
              }
            })
            return original.apply(this, args)
          }
      )
      handlers.push(restoreHandler)
    } catch {
      const hookHandler = hookSetter<CanvasRenderingContext2D>(CanvasRenderingContext2D.prototype, prop, {
        set: monitor(function (v) {
          cb({
            args: [v],
            id: mirror.getId((this.canvas as unknown) as INode),
            property: prop,
            setter: true,
          })
        }),
      })
      handlers.push(hookHandler)
    }
  }
  return () => {
    handlers.forEach((h) => h())
  }
}

declare class FontFace {
  constructor(family: string, source: string | ArrayBufferView, descriptors?: FontFaceDescriptors)
}

type WindowWithFontFace = typeof window & {
  FontFace: typeof FontFace
}

type DocumentWithFonts = Document & {
  fonts: { add(fontFace: FontFace): void }
}

function initFontObserver(cb: FontCallback): ListenerHandler {
  const handlers: ListenerHandler[] = []

  const fontMap = new WeakMap<object, FontParam>()

  const originalFontFace = (window as WindowWithFontFace).FontFace

  ;(window as WindowWithFontFace).FontFace = (function FontFace(
    family: string,
    source: string | ArrayBufferView,
    descriptors?: FontFaceDescriptors
  ): FontFace {
    const fontFace = new originalFontFace(family, source, descriptors)
    callMonitored(() => {
      fontMap.set(fontFace, {
        descriptors,
        family,
        buffer: typeof source !== 'string',
        fontSource: typeof source === 'string' ? source : JSON.stringify(Array.from(new Uint8Array(source as any))),
      })
    })
    return fontFace
  } as unknown) as typeof FontFace

  const restoreHandler = patch(
    (document as DocumentWithFonts).fonts,
    'add',
    (original: (fontFace: FontFace) => unknown) =>
      function (this: unknown, fontFace: FontFace) {
        setTimeout(
          monitor(() => {
            const p = fontMap.get(fontFace)
            if (p) {
              cb(p)
              fontMap.delete(fontFace)
            }
          }),
          0
        )
        return original.apply(this, [fontFace])
      }
  )

  handlers.push(() => {
    ;(window as any).FonFace = originalFontFace
  })
  handlers.push(restoreHandler)

  return () => {
    handlers.forEach((h) => h())
  }
}

export function initObservers(o: ObserverParam): ListenerHandler {
  const mutationHandler = initMutationObserver(
    o.mutationController,
    o.mutationCb,
    o.inlineStylesheet,
    o.maskInputOptions,
    o.recordCanvas,
    o.slimDOMOptions
  )
  const mousemoveHandler = initMoveObserver(o.mousemoveCb, o.sampling)
  const mouseInteractionHandler = initMouseInteractionObserver(o.mouseInteractionCb)
  const scrollHandler = initScrollObserver(o.scrollCb, o.sampling)
  const viewportResizeHandler = initViewportResizeObserver(o.viewportResizeCb)
  const inputHandler = initInputObserver(o.inputCb, o.maskInputOptions, o.maskInputFn, o.sampling)
  const mediaInteractionHandler = initMediaInteractionObserver(o.mediaInteractionCb)
  const styleSheetObserver = initStyleSheetObserver(o.styleSheetRuleCb)
  const canvasMutationObserver = o.recordCanvas ? initCanvasMutationObserver(o.canvasMutationCb) : noop
  const fontObserver = o.collectFonts ? initFontObserver(o.fontCb) : noop

  return () => {
    mutationHandler()
    mousemoveHandler()
    mouseInteractionHandler()
    scrollHandler()
    viewportResizeHandler()
    inputHandler()
    mediaInteractionHandler()
    styleSheetObserver()
    canvasMutationObserver()
    fontObserver()
  }
}
