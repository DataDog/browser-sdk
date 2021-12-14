import { monitor } from '../domain/internalMonitoring'

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
}

export enum ResourceType {
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

export enum RequestType {
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
  let pendingTimeoutId: number

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

export function assign(target: Assignable, ...toAssign: Assignable[]) {
  toAssign.forEach((source: Assignable) => {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key]
      }
    }
  })
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

interface ObjectWithToJSON {
  toJSON: (() => object) | undefined
}

type OriginalToJSON = [boolean, undefined | (() => object)]

/**
 * Custom implementation of JSON.stringify that ignores value.toJSON.
 * We need to do that because some sites badly override toJSON on certain objects.
 * Note this still supposes that JSON.stringify is correct...
 */
export function jsonStringify(
  value: unknown,
  replacer?: Array<string | number>,
  space?: string | number
): string | undefined {
  if (value === null || value === undefined) {
    return JSON.stringify(value)
  }
  let originalToJSON: OriginalToJSON = [false, undefined]
  if (hasToJSON(value)) {
    // We need to add a flag and not rely on the truthiness of value.toJSON
    // because it can be set but undefined and that's actually significant.
    originalToJSON = [true, value.toJSON]
    delete value.toJSON
  }

  let originalProtoToJSON: OriginalToJSON = [false, undefined]
  let prototype
  if (typeof value === 'object') {
    prototype = Object.getPrototypeOf(value) as object
    if (hasToJSON(prototype)) {
      originalProtoToJSON = [true, prototype.toJSON]
      delete prototype.toJSON
    }
  }

  let result: string
  try {
    result = JSON.stringify(value, replacer, space)
  } catch {
    result = '<error: unable to serialize object>'
  } finally {
    if (originalToJSON[0]) {
      ;(value as ObjectWithToJSON).toJSON = originalToJSON[1]
    }
    if (originalProtoToJSON[0]) {
      ;(prototype as ObjectWithToJSON).toJSON = originalProtoToJSON[1]
    }
  }
  return result
}

function hasToJSON(value: unknown): value is ObjectWithToJSON {
  return typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, 'toJSON')
}

export function includes(candidate: string, search: string): boolean
export function includes<T>(candidate: T[], search: T): boolean
export function includes(candidate: string | unknown[], search: any) {
  return candidate.indexOf(search) !== -1
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

/**
 * inspired by https://mathiasbynens.be/notes/globalthis
 */
export function getGlobalObject<T>(): T {
  if (typeof globalThis === 'object') {
    return (globalThis as unknown) as T
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

export function safeTruncate(candidate: string, length: number) {
  const lastChar = candidate.charCodeAt(length - 1)
  // check if it is the high part of a surrogate pair
  if (lastChar >= 0xd800 && lastChar <= 0xdbff) {
    return candidate.slice(0, length + 1)
  }
  return candidate.slice(0, length)
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
    return (new Date(source.getTime()) as unknown) as Merged<D, S>
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
    return (new RegExp(source.source, flags) as unknown) as Merged<D, S>
  }

  if (circularReferenceChecker.hasAlreadyBeenSeen(source)) {
    // remove circular references
    return (undefined as unknown) as Merged<D, S>
  } else if (Array.isArray(source)) {
    const merged: any[] = Array.isArray(destination) ? destination : []
    for (let i = 0; i < source.length; ++i) {
      merged[i] = mergeInto(merged[i], source[i], circularReferenceChecker)
    }
    return (merged as unknown) as Merged<D, S>
  }

  const merged: Record<any, any> = getType(destination) === 'object' ? destination : {}
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      merged[key] = mergeInto(merged[key], source[key], circularReferenceChecker)
    }
  }
  return (merged as unknown) as Merged<D, S>
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

// Define those utilities for TS 3.0 compatibility
// https://www.typescriptlang.org/docs/handbook/utility-types.html#thisparametertypetype
export type ThisParameterType<T> = T extends (this: infer U, ...args: any[]) => any ? U : unknown
// https://www.typescriptlang.org/docs/handbook/utility-types.html#parameterstype
export type Parameters<T extends (...args: any[]) => any> = T extends (...args: infer P) => any ? P : never
// https://www.typescriptlang.org/docs/handbook/utility-types.html#omittype-keys
export type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>
