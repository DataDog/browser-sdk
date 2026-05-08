/**
 * DOM utilities inlined from @datadog/browser-core to keep browser-replay-next dependency-free.
 */

// ---------------------------------------------------------------------------
// DOM_EVENT constants
// ---------------------------------------------------------------------------

export const DOM_EVENT = {
  BLUR: 'blur',
  CHANGE: 'change',
  CLICK: 'click',
  CONTEXT_MENU: 'contextmenu',
  DBL_CLICK: 'dblclick',
  FOCUS: 'focus',
  INPUT: 'input',
  MOUSE_DOWN: 'mousedown',
  MOUSE_MOVE: 'mousemove',
  MOUSE_UP: 'mouseup',
  PAUSE: 'pause',
  PLAY: 'play',
  POINTER_UP: 'pointerup',
  RESIZE: 'resize',
  SCROLL: 'scroll',
  TOUCH_END: 'touchend',
  TOUCH_MOVE: 'touchmove',
  TOUCH_START: 'touchstart',
} as const

export type DOM_EVENT = (typeof DOM_EVENT)[keyof typeof DOM_EVENT]

// ---------------------------------------------------------------------------
// noop
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function noop() {}

// ---------------------------------------------------------------------------
// TimeStamp — branded type matching serializationTransaction.ts
// ---------------------------------------------------------------------------

export type TimeStamp = number & { t: 'Epoch time' }

export function timeStampNow(): TimeStamp {
  return Date.now() as TimeStamp
}

// ---------------------------------------------------------------------------
// throttle
// ---------------------------------------------------------------------------

export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
) {
  const needLeadingExecution = options?.leading !== undefined ? options.leading : true
  const needTrailingExecution = options?.trailing !== undefined ? options.trailing : true
  let inWaitPeriod = false
  let pendingExecutionWithParameters: Parameters<T> | undefined
  let pendingTimeoutId: ReturnType<typeof setTimeout>

  return {
    throttled: (...parameters: Parameters<T>) => {
      if (inWaitPeriod) {
        pendingExecutionWithParameters = parameters
        return
      }
      if (needLeadingExecution) {
        fn(...parameters)
      } else {
        pendingExecutionWithParameters = parameters
      }
      inWaitPeriod = true
      pendingTimeoutId = setTimeout(() => {
        if (needTrailingExecution && pendingExecutionWithParameters) {
          fn(...pendingExecutionWithParameters)
        }
        inWaitPeriod = false
        pendingExecutionWithParameters = undefined
      }, wait)
    },
    cancel: () => {
      clearTimeout(pendingTimeoutId)
      inWaitPeriod = false
      pendingExecutionWithParameters = undefined
    },
  }
}

// ---------------------------------------------------------------------------
// requestIdleCallback
// ---------------------------------------------------------------------------

export interface IdleDeadline {
  readonly didTimeout: boolean
  timeRemaining(): DOMHighResTimeStamp
}

export function requestIdleCallback(
  callback: (deadline: IdleDeadline) => void,
  opts?: { timeout?: number }
): () => void {
  if (window.requestIdleCallback && window.cancelIdleCallback) {
    const id = window.requestIdleCallback(callback, opts)
    return () => window.cancelIdleCallback(id)
  }
  const start = Date.now()
  const timeoutId = setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
    })
  }, 0)
  return () => clearTimeout(timeoutId)
}

// ---------------------------------------------------------------------------
// monitor — simply calls the function; no error tracking in v8 replay
// ---------------------------------------------------------------------------

export function monitor<T extends (...args: any[]) => unknown>(fn: T): T {
  return fn
}

// ---------------------------------------------------------------------------
// addEventListener / addEventListeners
// ---------------------------------------------------------------------------

interface AddEventListenerOptions {
  once?: boolean
  capture?: boolean
  passive?: boolean
}

// Configuration is kept loose so any config object (e.g. ReplayConfig) can be passed.
// We use `object` as a permissive constraint and read allowUntrustedEvents safely.
// eslint-disable-next-line @typescript-eslint/ban-types
export type Configuration = object

export function addEventListener<Target extends EventTarget>(
  configuration: Configuration,
  eventTarget: Target,
  eventName: string,
  listener: (event: Event) => void,
  options: AddEventListenerOptions = {}
) {
  return addEventListeners(configuration, eventTarget, [eventName], listener, options)
}

export function addEventListeners<Target extends EventTarget>(
  configuration: Configuration,
  eventTarget: Target,
  eventNames: string[],
  listener: (event: Event) => void,
  { once, capture, passive }: AddEventListenerOptions = {}
) {
  const allowUntrustedEvents = (configuration as { allowUntrustedEvents?: boolean }).allowUntrustedEvents
  const wrappedListener = (event: Event) => {
    if (!event.isTrusted && !allowUntrustedEvents) {
      return
    }
    if (once) {
      stop()
    }
    listener(event)
  }

  const options = passive ? { capture, passive } : capture

  eventNames.forEach((eventName) => eventTarget.addEventListener(eventName, wrappedListener, options))

  function stop() {
    eventNames.forEach((eventName) => eventTarget.removeEventListener(eventName, wrappedListener, options))
  }

  return { stop }
}

// ---------------------------------------------------------------------------
// instrumentMethod / instrumentSetter
// ---------------------------------------------------------------------------

export interface InstrumentedMethodCall<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET> {
  target: TARGET
  parameters: Parameters<TARGET[METHOD]>
  onPostCall: (callback: (result: ReturnType<TARGET[METHOD]>) => void) => void
}

export function instrumentMethod<TARGET extends { [key: string]: any }, METHOD extends keyof TARGET>(
  targetPrototype: TARGET,
  method: METHOD,
  onPreCall: (callInfos: InstrumentedMethodCall<TARGET, METHOD>) => void
) {
  let original = targetPrototype[method]

  if (typeof original !== 'function') {
    return { stop: noop }
  }

  let stopped = false

  const instrumentation = function (this: TARGET): ReturnType<TARGET[METHOD]> {
    if (stopped) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      return original.apply(this, arguments as unknown as Parameters<TARGET[METHOD]>)
    }

    const parameters = Array.from(arguments) as Parameters<TARGET[METHOD]>
    let postCallCallback: ((result: ReturnType<TARGET[METHOD]>) => void) | undefined

    onPreCall({
      target: this,
      parameters,
      onPostCall: (cb) => {
        postCallCallback = cb
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = original.apply(this, parameters) as ReturnType<TARGET[METHOD]>

    if (postCallCallback) {
      postCallCallback(result)
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result
  }

  targetPrototype[method] = instrumentation as TARGET[METHOD]

  return {
    stop: () => {
      stopped = true
      if (targetPrototype[method] === instrumentation) {
        targetPrototype[method] = original
      }
    },
  }
}

export function instrumentSetter<TARGET extends { [key: string]: any }, PROPERTY extends keyof TARGET>(
  targetPrototype: TARGET,
  property: PROPERTY,
  after: (target: TARGET, value: TARGET[PROPERTY]) => void
) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(targetPrototype, property)
  if (!originalDescriptor || !originalDescriptor.set || !originalDescriptor.configurable) {
    return { stop: noop }
  }

  const stoppedInstrumentation = noop
  let instrumentation = (target: TARGET, value: TARGET[PROPERTY]) => {
    setTimeout(() => {
      if (instrumentation !== stoppedInstrumentation) {
        after(target, value)
      }
    }, 0)
  }

  const instrumentationWrapper = function (this: TARGET, value: TARGET[PROPERTY]) {
    originalDescriptor.set!.call(this, value)
    instrumentation(this, value)
  }

  Object.defineProperty(targetPrototype, property, {
    set: instrumentationWrapper,
  })

  return {
    stop: () => {
      if (Object.getOwnPropertyDescriptor(targetPrototype, property)?.set === instrumentationWrapper) {
        Object.defineProperty(targetPrototype, property, originalDescriptor)
      }
      instrumentation = stoppedInstrumentation
    },
  }
}

// ---------------------------------------------------------------------------
// getScrollX / getScrollY (from @datadog/browser-rum-core)
// ---------------------------------------------------------------------------

export function getScrollX(): number {
  let scrollX
  const visual = window.visualViewport
  if (visual) {
    scrollX = visual.pageLeft - visual.offsetLeft
  } else if (window.scrollX !== undefined) {
    scrollX = window.scrollX
  } else {
    scrollX = window.pageXOffset || 0
  }
  return Math.round(scrollX)
}

export function getScrollY(): number {
  let scrollY
  const visual = window.visualViewport
  if (visual) {
    scrollY = visual.pageTop - visual.offsetTop
  } else if (window.scrollY !== undefined) {
    scrollY = window.scrollY
  } else {
    scrollY = window.pageYOffset || 0
  }
  return Math.round(scrollY)
}

// ---------------------------------------------------------------------------
// getViewportDimension (from @datadog/browser-rum-core)
// ---------------------------------------------------------------------------

export interface ViewportDimension {
  height: number
  width: number
}

export function getViewportDimension(): ViewportDimension {
  const visual = window.visualViewport
  if (visual) {
    return {
      width: Number(visual.width * visual.scale),
      height: Number(visual.height * visual.scale),
    }
  }
  return {
    width: Number(window.innerWidth || 0),
    height: Number(window.innerHeight || 0),
  }
}

// ---------------------------------------------------------------------------
// getMutationObserverConstructor (from @datadog/browser-rum-core)
// ---------------------------------------------------------------------------

type MutationObserverConstructor = new (callback: MutationCallback) => MutationObserver

export function getMutationObserverConstructor(): MutationObserverConstructor | undefined {
  // Use native MutationObserver directly (no Zone.js workaround needed in standalone package)
  return window.MutationObserver as unknown as MutationObserverConstructor | undefined
}

// ---------------------------------------------------------------------------
// initViewportObservable (simplified inline)
// ---------------------------------------------------------------------------

export interface ViewportObservableSubscription {
  unsubscribe: () => void
}

export function initViewportObservable(
  configuration: Configuration,
  onViewportChange: (dimension: ViewportDimension) => void
): ViewportObservableSubscription {
  const { throttled: updateDimension } = throttle(() => {
    onViewportChange(getViewportDimension())
  }, 200)

  const { stop } = addEventListener(configuration, window, DOM_EVENT.RESIZE, updateDimension, {
    capture: true,
    passive: true,
  })

  return { unsubscribe: stop }
}
