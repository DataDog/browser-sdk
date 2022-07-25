import { monitor } from './monitor'

export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * ONE_SECOND
export const ONE_HOUR = 60 * ONE_MINUTE
export const ONE_DAY = 24 * ONE_HOUR
export const ONE_YEAR = 365 * ONE_DAY
export const ONE_KILO_BYTE = 1024

export const enum DOM_EVENT {
  BEFORE_UNLOAD = 'beforeunload',
  CLICK = 'click',
  DBL_CLICK = 'dblclick',
  KEY_DOWN = 'keydown',
  LOAD = 'load',
  POP_STATE = 'popstate',
  SCROLL = 'scroll',
  TOUCH_START = 'touchstart',
  TOUCH_END = 'touchend',
  TOUCH_MOVE = 'touchmove',
  VISIBILITY_CHANGE = 'visibilitychange',
  DOM_CONTENT_LOADED = 'DOMContentLoaded',
  POINTER_DOWN = 'pointerdown',
  POINTER_UP = 'pointerup',
  POINTER_CANCEL = 'pointercancel',
  HASH_CHANGE = 'hashchange',
  PAGE_HIDE = 'pagehide',
  MOUSE_DOWN = 'mousedown',
  MOUSE_UP = 'mouseup',
  MOUSE_MOVE = 'mousemove',
  FOCUS = 'focus',
  BLUR = 'blur',
  CONTEXT_MENU = 'contextmenu',
  RESIZE = 'resize',
  CHANGE = 'change',
  INPUT = 'input',
  PLAY = 'play',
  PAUSE = 'pause',
  SECURITY_POLICY_VIOLATION = 'securitypolicyviolation',
  SELECTION_CHANGE = 'selectionchange',
}

export const enum ResourceType {
  DOCUMENT = 'document',
  XHR = 'xhr',
  BEACON = 'beacon',
  FETCH = 'fetch',
  CSS = 'css',
  JS = 'js',
  IMAGE = 'image',
  FONT = 'font',
  MEDIA = 'media',
  OTHER = 'other',
}

export const enum RequestType {
  FETCH = ResourceType.FETCH,
  XHR = ResourceType.XHR,
}

// use lodash API
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
) {
  const needLeadingExecution = options && options.leading !== undefined ? options.leading : true
  const needTrailingExecution = options && options.trailing !== undefined ? options.trailing : true
  let inWaitPeriod = false
  let pendingExecutionWithParameters: Parameters<T> | undefined
  let pendingTimeoutId: TimeoutId

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

interface Assignable {
  [key: string]: any
}

export function assign<T, U>(target: T, source: U): T & U
export function assign<T, U, V>(target: T, source1: U, source2: V): T & U & V
export function assign<T, U, V, W>(target: T, source1: U, source2: V, source3: W): T & U & V & W
export function assign(target: Assignable, ...toAssign: Assignable[]) {
  toAssign.forEach((source: Assignable) => {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key]
      }
    }
  })
  return target
}

export function shallowClone<T>(object: T): T & Record<string, never> {
  return assign({}, object)
}

/**
 * UUID v4
 * from https://gist.github.com/jed/982883
 */
export function generateUUID(placeholder?: string): string {
  return placeholder
    ? // eslint-disable-next-line  no-bitwise
      (parseInt(placeholder, 10) ^ ((Math.random() * 16) >> (parseInt(placeholder, 10) / 4))).toString(16)
    : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateUUID)
}

/**
 * Return true if the draw is successful
 * @param threshold between 0 and 100
 */
export function performDraw(threshold: number): boolean {
  return threshold !== 0 && Math.random() * 100 <= threshold
}

export function round(num: number, decimals: 0 | 1 | 2 | 3 | 4) {
  return +num.toFixed(decimals)
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function noop() {}

/**
 * Custom implementation of JSON.stringify that ignores some toJSON methods. We need to do that
 * because some sites badly override toJSON on certain objects. Removing all toJSON methods from
 * nested values would be too costly, so we just detach them from the root value, and native classes
 * used to build JSON values (Array and Object).
 *
 * Note: this still assumes that JSON.stringify is correct.
 */
export function jsonStringify(
  value: unknown,
  replacer?: Array<string | number>,
  space?: string | number
): string | undefined {
  // Note: The order matter here. We need to detach toJSON methods on parent classes before their
  // subclasses.
  const restoreObjectPrototypeToJson = detachToJsonMethod(Object.prototype)
  const restoreArrayPrototypeToJson = detachToJsonMethod(Array.prototype)
  const restoreValuePrototypeToJson = detachToJsonMethod(value && Object.getPrototypeOf(value))
  const restoreValueToJson = detachToJsonMethod(value)

  try {
    return JSON.stringify(value, replacer, space)
  } catch {
    return '<error: unable to serialize object>'
  } finally {
    restoreObjectPrototypeToJson()
    restoreArrayPrototypeToJson()
    restoreValueToJson()
    restoreValuePrototypeToJson()
  }
}

interface ObjectWithToJsonMethod {
  toJSON: (() => object) | undefined
}
function detachToJsonMethod(value: unknown) {
  if (typeof value === 'object' && value !== null) {
    const object = value as ObjectWithToJsonMethod
    const objectToJson = object.toJSON
    if (objectToJson) {
      delete object.toJSON
      return () => {
        object.toJSON = objectToJson
      }
    }
  }

  return noop
}

export function includes(candidate: string, search: string): boolean
export function includes<T>(candidate: T[], search: T): boolean
export function includes(candidate: string | unknown[], search: any) {
  return candidate.indexOf(search) !== -1
}

export function arrayFrom<T>(arrayLike: ArrayLike<T> | Set<T>): T[] {
  if (Array.from) {
    return Array.from(arrayLike)
  }

  const array = []

  if (arrayLike instanceof Set) {
    arrayLike.forEach((item) => array.push(item))
  } else {
    for (let i = 0; i < arrayLike.length; i++) {
      array.push(arrayLike[i])
    }
  }

  return array
}

export function find<T, S extends T>(
  array: T[],
  predicate: (item: T, index: number, array: T[]) => item is S
): S | undefined {
  for (let i = 0; i < array.length; i += 1) {
    const item = array[i]
    if (predicate(item, i, array)) {
      return item
    }
  }
  return undefined
}

export function findLast<T, S extends T>(
  array: T[],
  predicate: (item: T, index: number, array: T[]) => item is S
): S | undefined {
  for (let i = array.length - 1; i >= 0; i -= 1) {
    const item = array[i]
    if (predicate(item, i, array)) {
      return item
    }
  }
  return undefined
}

export function isPercentage(value: unknown) {
  return isNumber(value) && value >= 0 && value <= 100
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number'
}

export function objectValues<T = unknown>(object: { [key: string]: T }) {
  return Object.keys(object).map((key) => object[key])
}

export function objectHasValue<T extends { [key: string]: unknown }>(object: T, value: unknown): value is T[keyof T] {
  return Object.keys(object).some((key) => object[key] === value)
}

export function objectEntries(object: { [key: string]: unknown }): Array<[string, unknown]> {
  return Object.keys(object).map((key) => [key, object[key]])
}

export function isEmptyObject(object: object) {
  return Object.keys(object).length === 0
}

export function mapValues<A, B>(object: { [key: string]: A }, fn: (arg: A) => B) {
  const newObject: { [key: string]: B } = {}
  for (const key of Object.keys(object)) {
    newObject[key] = fn(object[key])
  }
  return newObject
}

export function startsWith(candidate: string, search: string) {
  return candidate.slice(0, search.length) === search
}

/**
 * inspired by https://mathiasbynens.be/notes/globalthis
 */
export function getGlobalObject<T>(): T {
  if (typeof globalThis === 'object') {
    return globalThis as unknown as T
  }
  Object.defineProperty(Object.prototype, '_dd_temp_', {
    get() {
      return this as object
    },
    configurable: true,
  })
  // @ts-ignore _dd_temp is defined using defineProperty
  let globalObject: unknown = _dd_temp_
  // @ts-ignore _dd_temp is defined using defineProperty
  delete Object.prototype._dd_temp_
  if (typeof globalObject !== 'object') {
    // on safari _dd_temp_ is available on window but not globally
    // fallback on other browser globals check
    if (typeof self === 'object') {
      globalObject = self
    } else if (typeof window === 'object') {
      globalObject = window
    } else {
      globalObject = {}
    }
  }
  return globalObject as T
}

export function getLocationOrigin() {
  return getLinkElementOrigin(window.location)
}

/**
 * IE fallback
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLHyperlinkElementUtils/origin
 */
export function getLinkElementOrigin(element: Location | HTMLAnchorElement | URL) {
  if (element.origin) {
    return element.origin
  }
  const sanitizedHost = element.host.replace(/(:80|:443)$/, '')
  return `${element.protocol}//${sanitizedHost}`
}

export function findCommaSeparatedValue(rawString: string, name: string) {
  const regex = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*([^;]+)`)
  const matches = regex.exec(rawString)
  return matches ? matches[1] : undefined
}

export function safeTruncate(candidate: string, length: number, suffix = '') {
  const lastChar = candidate.charCodeAt(length - 1)
  const isLastCharSurrogatePair = lastChar >= 0xd800 && lastChar <= 0xdbff
  const correctedLength = isLastCharSurrogatePair ? length + 1 : length

  if (candidate.length <= correctedLength) return candidate

  return `${candidate.slice(0, correctedLength)}${suffix}`
}

export interface EventEmitter {
  addEventListener(
    event: DOM_EVENT,
    listener: (event: Event) => void,
    options?: boolean | { capture?: boolean; passive?: boolean }
  ): void
  removeEventListener(
    event: DOM_EVENT,
    listener: (event: Event) => void,
    options?: boolean | { capture?: boolean; passive?: boolean }
  ): void
}

interface AddEventListenerOptions {
  once?: boolean
  capture?: boolean
  passive?: boolean
}

/**
 * Add an event listener to an event emitter object (Window, Element, mock object...).  This provides
 * a few conveniences compared to using `element.addEventListener` directly:
 *
 * * supports IE11 by: using an option object only if needed and emulating the `once` option
 *
 * * wraps the listener with a `monitor` function
 *
 * * returns a `stop` function to remove the listener
 */
export function addEventListener<E extends Event>(
  emitter: EventEmitter,
  event: DOM_EVENT,
  listener: (event: E) => void,
  options?: AddEventListenerOptions
) {
  return addEventListeners(emitter, [event], listener, options)
}

/**
 * Add event listeners to an event emitter object (Window, Element, mock object...).  This provides
 * a few conveniences compared to using `element.addEventListener` directly:
 *
 * * supports IE11 by: using an option object only if needed and emulating the `once` option
 *
 * * wraps the listener with a `monitor` function
 *
 * * returns a `stop` function to remove the listener
 *
 * * with `once: true`, the listener will be called at most once, even if different events are listened
 */
export function addEventListeners<E extends Event>(
  emitter: EventEmitter,
  events: DOM_EVENT[],
  listener: (event: E) => void,
  { once, capture, passive }: { once?: boolean; capture?: boolean; passive?: boolean } = {}
) {
  const wrappedListener = monitor(
    once
      ? (event: Event) => {
          stop()
          listener(event as E)
        }
      : (listener as (event: Event) => void)
  )

  const options = passive ? { capture, passive } : capture
  events.forEach((event) => emitter.addEventListener(event, wrappedListener, options))
  const stop = () => events.forEach((event) => emitter.removeEventListener(event, wrappedListener, options))

  return {
    stop,
  }
}

export function elementMatches(element: Element & { msMatchesSelector?(selector: string): boolean }, selector: string) {
  if (element.matches) {
    return element.matches(selector)
  }
  // IE11 support
  if (element.msMatchesSelector) {
    return element.msMatchesSelector(selector)
  }
  return false
}

export function runOnReadyState(expectedReadyState: 'complete' | 'interactive', callback: () => void) {
  if (document.readyState === expectedReadyState || document.readyState === 'complete') {
    callback()
  } else {
    const eventName = expectedReadyState === 'complete' ? DOM_EVENT.LOAD : DOM_EVENT.DOM_CONTENT_LOADED
    addEventListener(window, eventName, callback, { once: true })
  }
}

/**
 * Similar to `typeof`, but distinguish plain objects from `null` and arrays
 */
export function getType(value: unknown) {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  return typeof value
}

type Merged<TDestination, TSource> =
  // case 1 - source is undefined - return destination
  TSource extends undefined
    ? TDestination
    : // case 2 - destination is undefined - return source
    TDestination extends undefined
    ? TSource
    : // case 3 - source is an array - see if it merges or overwrites
    TSource extends any[]
    ? TDestination extends any[]
      ? TDestination & TSource
      : TSource
    : // case 4 - source is an object - see if it merges or overwrites
    TSource extends object
    ? TDestination extends object
      ? TDestination extends any[]
        ? TSource
        : TDestination & TSource
      : TSource
    : // case 5 - cannot merge - return source
      TSource

interface CircularReferenceChecker {
  hasAlreadyBeenSeen(value: any): boolean
}
function createCircularReferenceChecker(): CircularReferenceChecker {
  if (typeof WeakSet !== 'undefined') {
    const set: WeakSet<any> = new WeakSet()
    return {
      hasAlreadyBeenSeen(value) {
        const has = set.has(value)
        if (!has) {
          set.add(value)
        }
        return has
      },
    }
  }
  const array: any[] = []
  return {
    hasAlreadyBeenSeen(value) {
      const has = array.indexOf(value) >= 0
      if (!has) {
        array.push(value)
      }
      return has
    },
  }
}

/**
 * Iterate over source and affect its sub values into destination, recursively.
 * If the source and destination can't be merged, return source.
 */
export function mergeInto<D, S>(
  destination: D,
  source: S,
  circularReferenceChecker = createCircularReferenceChecker()
): Merged<D, S> {
  // ignore the source if it is undefined
  if (source === undefined) {
    return destination as Merged<D, S>
  }

  if (typeof source !== 'object' || source === null) {
    // primitive values - just return source
    return source as Merged<D, S>
  } else if (source instanceof Date) {
    return new Date(source.getTime()) as unknown as Merged<D, S>
  } else if (source instanceof RegExp) {
    const flags =
      source.flags ||
      // old browsers compatibility
      [
        source.global ? 'g' : '',
        source.ignoreCase ? 'i' : '',
        source.multiline ? 'm' : '',
        source.sticky ? 'y' : '',
        source.unicode ? 'u' : '',
      ].join('')
    return new RegExp(source.source, flags) as unknown as Merged<D, S>
  }

  if (circularReferenceChecker.hasAlreadyBeenSeen(source)) {
    // remove circular references
    return undefined as unknown as Merged<D, S>
  } else if (Array.isArray(source)) {
    const merged: any[] = Array.isArray(destination) ? destination : []
    for (let i = 0; i < source.length; ++i) {
      merged[i] = mergeInto(merged[i], source[i], circularReferenceChecker)
    }
    return merged as unknown as Merged<D, S>
  }

  const merged: Record<any, any> = getType(destination) === 'object' ? destination : {}
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      merged[key] = mergeInto(merged[key], source[key], circularReferenceChecker)
    }
  }
  return merged as unknown as Merged<D, S>
}

/**
 * A simplistic implementation of a deep clone algorithm.
 * Caveats:
 * - It doesn't maintain prototype chains - don't use with instances of custom classes.
 * - It doesn't handle Map and Set
 */
export function deepClone<T>(value: T): T {
  return mergeInto(undefined, value) as T
}

type Combined<A, B> = A extends null ? B : B extends null ? A : Merged<A, B>

/*
 * Performs a deep merge of objects and arrays.
 * - Arguments won't be mutated
 * - Object and arrays in the output value are dereferenced ("deep cloned")
 * - Arrays values are merged index by index
 * - Objects are merged by keys
 * - Values get replaced, unless undefined
 */
export function combine<A, B>(a: A, b: B): Combined<A, B>
export function combine<A, B, C>(a: A, b: B, c: C): Combined<Combined<A, B>, C>
export function combine<A, B, C, D>(a: A, b: B, c: C, d: D): Combined<Combined<Combined<A, B>, C>, D>
export function combine<A, B, C, D, E>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E
): Combined<Combined<Combined<Combined<A, B>, C>, D>, E>
export function combine<A, B, C, D, E, F>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F
): Combined<Combined<Combined<Combined<Combined<A, B>, C>, D>, E>, F>
export function combine<A, B, C, D, E, F, G>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
  g: G
): Combined<Combined<Combined<Combined<Combined<Combined<A, B>, C>, D>, E>, F>, G>
export function combine<A, B, C, D, E, F, G, H>(
  a: A,
  b: B,
  c: C,
  d: D,
  e: E,
  f: F,
  g: G,
  h: H
): Combined<Combined<Combined<Combined<Combined<Combined<Combined<A, B>, C>, D>, E>, F>, G>, H>
export function combine(...sources: any[]): unknown {
  let destination: any

  for (const source of sources) {
    // Ignore any undefined or null sources.
    if (source === undefined || source === null) {
      continue
    }

    destination = mergeInto(destination, source)
  }

  return destination as unknown
}

export type TimeoutId = ReturnType<typeof setTimeout>

export function requestIdleCallback(callback: () => void, opts?: { timeout?: number }) {
  // Use 'requestIdleCallback' when available: it will throttle the mutation processing if the
  // browser is busy rendering frames (ex: when frames are below 60fps). When not available, the
  // fallback on 'requestAnimationFrame' will still ensure the mutations are processed after any
  // browser rendering process (Layout, Recalculate Style, etc.), so we can serialize DOM nodes
  // efficiently.
  if (window.requestIdleCallback) {
    const id = window.requestIdleCallback(monitor(callback), opts)
    return () => window.cancelIdleCallback(id)
  }
  const id = window.requestAnimationFrame(monitor(callback))
  return () => window.cancelAnimationFrame(id)
}

export function removeDuplicates<T>(array: T[]) {
  const set = new Set<T>()
  array.forEach((item) => set.add(item))
  return arrayFrom(set)
}

export function matchList(list: Array<string | RegExp>, value: string) {
  return list.some((item) => item === value || (item instanceof RegExp && item.test(value)))
}

// https://github.com/jquery/jquery/blob/a684e6ba836f7c553968d7d026ed7941e1a612d8/src/selector/escapeSelector.js
export function cssEscape(str: string) {
  if (window.CSS && window.CSS.escape) {
    return window.CSS.escape(str)
  }

  // eslint-disable-next-line no-control-regex
  return str.replace(/([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g, function (ch, asCodePoint) {
    if (asCodePoint) {
      // U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
      if (ch === '\0') {
        return '\uFFFD'
      }
      // Control characters and (dependent upon position) numbers get escaped as code points
      return `${ch.slice(0, -1)}\\${ch.charCodeAt(ch.length - 1).toString(16)} `
    }
    // Other potentially-special ASCII characters get backslash-escaped
    return `\\${ch}`
  })
}
