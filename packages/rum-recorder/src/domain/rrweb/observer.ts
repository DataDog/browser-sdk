import { noop } from '@datadog/browser-core'
import { INode, MaskInputOptions, SlimDOMOptions } from 'rrweb-snapshot'
import { MutationBuffer } from './mutation'
import {
  Arguments,
  BlockClass,
  CanvasMutationCallback,
  FontCallback,
  FontFaceDescriptors,
  FontParam,
  HookResetter,
  HooksParam,
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
import {
  getWindowHeight,
  getWindowWidth,
  hookSetter,
  isBlocked,
  isTouchEvent,
  mirror,
  on,
  patch,
  throttle,
} from './utils'

export const mutationBuffer = new MutationBuffer()

function initMutationObserver(
  cb: MutationCallBack,
  blockClass: BlockClass,
  blockSelector: string | null,
  inlineStylesheet: boolean,
  maskInputOptions: MaskInputOptions,
  recordCanvas: boolean,
  slimDOMOptions: SlimDOMOptions
): MutationObserver {
  // see mutation.ts for details
  mutationBuffer.init(cb, blockClass, blockSelector, inlineStylesheet, maskInputOptions, recordCanvas, slimDOMOptions)
  const observer = new MutationObserver(mutationBuffer.processMutations)
  observer.observe(document, {
    attributeOldValue: true,
    attributes: true,
    characterData: true,
    characterDataOldValue: true,
    childList: true,
    subtree: true,
  })
  return observer
}

function initMoveObserver(cb: MousemoveCallBack, sampling: SamplingStrategy): ListenerHandler {
  if (sampling.mousemove === false) {
    return noop
  }

  const threshold = typeof sampling.mousemove === 'number' ? sampling.mousemove : 50

  const updatePosition = throttle<MouseEvent | TouchEvent>(
    (evt) => {
      const { target } = evt
      const { clientX, clientY } = isTouchEvent(evt) ? evt.changedTouches[0] : evt
      const position = {
        id: mirror.getId(target as INode),
        timeOffset: 0,
        x: clientX,
        y: clientY,
      }
      cb([position], isTouchEvent(evt) ? IncrementalSource.TouchMove : IncrementalSource.MouseMove)
    },
    threshold,
    {
      trailing: false,
    }
  )
  const handlers = [on('mousemove', updatePosition), on('touchmove', updatePosition)]
  return () => {
    handlers.forEach((h) => h())
  }
}

function initMouseInteractionObserver(
  cb: MouseInteractionCallBack,
  blockClass: BlockClass,
  sampling: SamplingStrategy
): ListenerHandler {
  if (sampling.mouseInteraction === false) {
    return noop
  }
  const disableMap: Record<string, boolean | undefined> =
    sampling.mouseInteraction === true || sampling.mouseInteraction === undefined ? {} : sampling.mouseInteraction

  const handlers: ListenerHandler[] = []
  const getHandler = (eventKey: keyof typeof MouseInteractions) => (event: MouseEvent | TouchEvent) => {
    if (isBlocked(event.target as Node, blockClass)) {
      return
    }
    const id = mirror.getId(event.target as INode)
    const { clientX, clientY } = isTouchEvent(event) ? event.changedTouches[0] : event
    cb({
      id,
      type: MouseInteractions[eventKey],
      x: clientX,
      y: clientY,
    })
  }
  ;(Object.keys(MouseInteractions) as Array<keyof typeof MouseInteractions>)
    .filter((key) => Number.isNaN(Number(key)) && !key.endsWith('_Departed') && disableMap[key] !== false)
    .forEach((eventKey: keyof typeof MouseInteractions) => {
      const eventName = eventKey.toLowerCase()
      const handler = getHandler(eventKey)
      handlers.push(on(eventName, handler))
    })
  return () => {
    handlers.forEach((h) => h())
  }
}

function initScrollObserver(cb: ScrollCallback, blockClass: BlockClass, sampling: SamplingStrategy): ListenerHandler {
  const updatePosition = throttle<UIEvent>((evt) => {
    if (!evt.target || isBlocked(evt.target as Node, blockClass)) {
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
  }, sampling.scroll || 100)
  return on('scroll', updatePosition)
}

function initViewportResizeObserver(cb: ViewportResizeCallback): ListenerHandler {
  const updateDimension = throttle(() => {
    const height = getWindowHeight()
    const width = getWindowWidth()
    cb({
      height: Number(height),
      width: Number(width),
    })
  }, 200)
  return on('resize', updateDimension, window)
}

export const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']
const lastInputValueMap: WeakMap<EventTarget, InputValue> = new WeakMap()
function initInputObserver(
  cb: InputCallback,
  blockClass: BlockClass,
  ignoreClass: string,
  maskInputOptions: MaskInputOptions,
  maskInputFn: MaskInputFn | undefined,
  sampling: SamplingStrategy
): ListenerHandler {
  function eventHandler(event: Event) {
    const { target } = event
    if (
      !target ||
      !(target as Element).tagName ||
      INPUT_TAGS.indexOf((target as Element).tagName) < 0 ||
      isBlocked(target as Node, blockClass)
    ) {
      return
    }
    const type: string | undefined = (target as HTMLInputElement).type
    if (type === 'password' || (target as HTMLElement).classList.contains(ignoreClass)) {
      return
    }
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
      document.querySelectorAll(`input[type="radio"][name="${name}"]`).forEach((el) => {
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
  const events = sampling.input === 'last' ? ['change'] : ['input', 'change']
  const handlers: Array<ListenerHandler | HookResetter> = events.map((eventName) => on(eventName, eventHandler))
  const propertyDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  const hookProperties: Array<[HTMLElement, string]> = [
    [HTMLInputElement.prototype, 'value'],
    [HTMLInputElement.prototype, 'checked'],
    [HTMLSelectElement.prototype, 'value'],
    [HTMLTextAreaElement.prototype, 'value'],
    // Some UI library use selectedIndex to set select value
    [HTMLSelectElement.prototype, 'selectedIndex'],
  ]
  if (propertyDescriptor && propertyDescriptor.set) {
    handlers.push(
      ...hookProperties.map((p) =>
        hookSetter<HTMLElement>(p[0], p[1], {
          set() {
            // mock to a normal event
            eventHandler(({ target: this } as unknown) as Event)
          },
        })
      )
    )
  }
  return () => {
    handlers.forEach((h) => h())
  }
}

function initStyleSheetObserver(cb: StyleSheetRuleCallback): ListenerHandler {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const insertRule = CSSStyleSheet.prototype.insertRule
  CSSStyleSheet.prototype.insertRule = function (rule: string, index?: number) {
    const id = mirror.getId(this.ownerNode as INode)
    if (id !== -1) {
      cb({
        id,
        adds: [{ rule, index }],
      })
    }
    return insertRule.call(this, rule, index)
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const deleteRule = CSSStyleSheet.prototype.deleteRule
  CSSStyleSheet.prototype.deleteRule = function (index: number) {
    const id = mirror.getId(this.ownerNode as INode)
    if (id !== -1) {
      cb({
        id,
        removes: [{ index }],
      })
    }
    return deleteRule.call(this, index)
  }

  return () => {
    CSSStyleSheet.prototype.insertRule = insertRule
    CSSStyleSheet.prototype.deleteRule = deleteRule
  }
}

function initMediaInteractionObserver(
  mediaInteractionCb: MediaInteractionCallback,
  blockClass: BlockClass
): ListenerHandler {
  const handler = (type: 'play' | 'pause') => (event: Event) => {
    const { target } = event
    if (!target || isBlocked(target as Node, blockClass)) {
      return
    }
    mediaInteractionCb({
      id: mirror.getId(target as INode),
      type: type === 'play' ? MediaInteractions.Play : MediaInteractions.Pause,
    })
  }
  const handlers = [on('play', handler('play')), on('pause', handler('pause'))]
  return () => {
    handlers.forEach((h) => h())
  }
}

function initCanvasMutationObserver(cb: CanvasMutationCallback, blockClass: BlockClass): ListenerHandler {
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
            if (!isBlocked(this.canvas, blockClass)) {
              setTimeout(() => {
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
              }, 0)
            }
            return original.apply(this, args)
          }
      )
      handlers.push(restoreHandler)
    } catch {
      const hookHandler = hookSetter<CanvasRenderingContext2D>(CanvasRenderingContext2D.prototype, prop, {
        set(v) {
          cb({
            args: [v],
            id: mirror.getId((this.canvas as unknown) as INode),
            property: prop,
            setter: true,
          })
        },
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
    fontMap.set(fontFace, {
      descriptors,
      family,
      buffer: typeof source !== 'string',
      fontSource:
        typeof source === 'string'
          ? source
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            JSON.stringify(Array.from(new Uint8Array(source as any))),
    })
    return fontFace
  } as unknown) as typeof FontFace

  const restoreHandler = patch(
    (document as DocumentWithFonts).fonts,
    'add',
    (original: (fontFace: FontFace) => unknown) =>
      function (this: unknown, fontFace: FontFace) {
        setTimeout(() => {
          const p = fontMap.get(fontFace)
          if (p) {
            cb(p)
            fontMap.delete(fontFace)
          }
        }, 0)
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

function mergeHooks(o: ObserverParam, hooks: HooksParam) {
  const {
    mutationCb,
    mousemoveCb,
    mouseInteractionCb,
    scrollCb,
    viewportResizeCb,
    inputCb,
    mediaInteractionCb,
    styleSheetRuleCb,
    canvasMutationCb,
    fontCb,
  } = o
  o.mutationCb = (...p: Arguments<MutationCallBack>) => {
    if (hooks.mutation) {
      hooks.mutation(...p)
    }
    mutationCb(...p)
  }
  o.mousemoveCb = (...p: Arguments<MousemoveCallBack>) => {
    if (hooks.mousemove) {
      hooks.mousemove(...p)
    }
    mousemoveCb(...p)
  }
  o.mouseInteractionCb = (...p: Arguments<MouseInteractionCallBack>) => {
    if (hooks.mouseInteraction) {
      hooks.mouseInteraction(...p)
    }
    mouseInteractionCb(...p)
  }
  o.scrollCb = (...p: Arguments<ScrollCallback>) => {
    if (hooks.scroll) {
      hooks.scroll(...p)
    }
    scrollCb(...p)
  }
  o.viewportResizeCb = (...p: Arguments<ViewportResizeCallback>) => {
    if (hooks.viewportResize) {
      hooks.viewportResize(...p)
    }
    viewportResizeCb(...p)
  }
  o.inputCb = (...p: Arguments<InputCallback>) => {
    if (hooks.input) {
      hooks.input(...p)
    }
    inputCb(...p)
  }
  o.mediaInteractionCb = (...p: Arguments<MediaInteractionCallback>) => {
    if (hooks.mediaInteaction) {
      hooks.mediaInteaction(...p)
    }
    mediaInteractionCb(...p)
  }
  o.styleSheetRuleCb = (...p: Arguments<StyleSheetRuleCallback>) => {
    if (hooks.styleSheetRule) {
      hooks.styleSheetRule(...p)
    }
    styleSheetRuleCb(...p)
  }
  o.canvasMutationCb = (...p: Arguments<CanvasMutationCallback>) => {
    if (hooks.canvasMutation) {
      hooks.canvasMutation(...p)
    }
    canvasMutationCb(...p)
  }
  o.fontCb = (...p: Arguments<FontCallback>) => {
    if (hooks.font) {
      hooks.font(...p)
    }
    fontCb(...p)
  }
}

export function initObservers(o: ObserverParam, hooks: HooksParam = {}): ListenerHandler {
  mergeHooks(o, hooks)
  const mutationObserver = initMutationObserver(
    o.mutationCb,
    o.blockClass,
    o.blockSelector,
    o.inlineStylesheet,
    o.maskInputOptions,
    o.recordCanvas,
    o.slimDOMOptions
  )
  const mousemoveHandler = initMoveObserver(o.mousemoveCb, o.sampling)
  const mouseInteractionHandler = initMouseInteractionObserver(o.mouseInteractionCb, o.blockClass, o.sampling)
  const scrollHandler = initScrollObserver(o.scrollCb, o.blockClass, o.sampling)
  const viewportResizeHandler = initViewportResizeObserver(o.viewportResizeCb)
  const inputHandler = initInputObserver(
    o.inputCb,
    o.blockClass,
    o.ignoreClass,
    o.maskInputOptions,
    o.maskInputFn,
    o.sampling
  )
  const mediaInteractionHandler = initMediaInteractionObserver(o.mediaInteractionCb, o.blockClass)
  const styleSheetObserver = initStyleSheetObserver(o.styleSheetRuleCb)
  const canvasMutationObserver = o.recordCanvas ? initCanvasMutationObserver(o.canvasMutationCb, o.blockClass) : noop
  const fontObserver = o.collectFonts ? initFontObserver(o.fontCb) : noop

  return () => {
    mutationObserver.disconnect()
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
