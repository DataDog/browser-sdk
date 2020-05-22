export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * ONE_SECOND
export const ONE_HOUR = 60 * ONE_MINUTE
export const ONE_KILO_BYTE = 1024

export enum DOM_EVENT {
  BEFORE_UNLOAD = 'beforeunload',
  CLICK = 'click',
  KEY_DOWN = 'keydown',
  LOAD = 'load',
  POP_STATE = 'popstate',
  SCROLL = 'scroll',
  TOUCH_START = 'touchstart',
  VISIBILITY_CHANGE = 'visibilitychange',
}

export enum ResourceKind {
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

// use lodash API
export function throttle(
  fn: () => void,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
): { throttled: () => void; stop: () => void } {
  const needLeadingExecution = options && options.leading !== undefined ? options.leading : true
  const needTrailingExecution = options && options.trailing !== undefined ? options.trailing : true
  let inWaitPeriod = false
  let hasPendingExecution = false
  let pendingTimeoutId: number
  let isStopped = false

  return {
    throttled(this: any) {
      if (isStopped) {
        return
      }
      if (inWaitPeriod) {
        hasPendingExecution = true
        return
      }
      if (needLeadingExecution) {
        fn.apply(this)
      } else {
        hasPendingExecution = true
      }
      inWaitPeriod = true
      pendingTimeoutId = window.setTimeout(() => {
        if (needTrailingExecution && hasPendingExecution) {
          fn.apply(this)
        }
        inWaitPeriod = false
        hasPendingExecution = false
      }, wait)
    },
    stop() {
      window.clearTimeout(pendingTimeoutId)
      isStopped = true
    },
  }
}

const isContextArray = (value: ContextValue): value is ContextArray => Array.isArray(value)
const isContext = (value: ContextValue): value is Context => !Array.isArray(value) && typeof value === 'object'

/**
 * Performs a deep merge of objects and arrays
 * - arrays values are merged index by index
 * - objects are merged by keys
 * - values get replaced, unless undefined
 *
 * ⚠️ this method does not prevent infinite loops while merging circular references ⚠️
 *
 */
export function deepMerge(destination: ContextValue, ...toMerge: ContextValue[]): ContextValue {
  return toMerge.reduce((value1: ContextValue, value2: ContextValue): ContextValue => {
    if (isContextArray(value1) && isContextArray(value2)) {
      return [...Array(Math.max(value1.length, value2.length))].map((_, index) =>
        deepMerge(value1[index], value2[index])
      )
    }
    if (isContext(value1) && isContext(value2)) {
      return Object.keys(value2).reduce(
        (merged, key) => ({
          ...merged,
          [key]: deepMerge(value1[key], value2[key]),
        }),
        value1
      )
    }
    return value2 === undefined ? value1 : value2
  }, destination)
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
    ? // tslint:disable-next-line no-bitwise
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

export function round(num: number, decimals: 0 | 1 | 2 | 3) {
  return +num.toFixed(decimals)
}

export function msToNs(duration: number) {
  return round(duration * 1e6, 0)
}

export interface Context {
  [x: string]: ContextValue
}

export type ContextValue = string | number | boolean | Context | ContextArray | undefined

export interface ContextArray extends Array<ContextValue> {}

export function withSnakeCaseKeys(candidate: Context): Context {
  const result: Context = {}
  Object.keys(candidate as Context).forEach((key: string) => {
    result[toSnakeCase(key)] = deepSnakeCase(candidate[key])
  })
  return result as Context
}

export function deepSnakeCase(candidate: ContextValue): ContextValue {
  if (Array.isArray(candidate)) {
    return candidate.map((value: ContextValue) => deepSnakeCase(value))
  }
  if (typeof candidate === 'object') {
    return withSnakeCaseKeys(candidate)
  }
  return candidate
}

export function toSnakeCase(word: string) {
  return word
    .replace(
      /[A-Z]/g,
      (uppercaseLetter: string, index: number) => `${index !== 0 ? '_' : ''}${uppercaseLetter.toLowerCase()}`
    )
    .replace(/-/g, '_')
}

// tslint:disable-next-line:no-empty
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
    result = JSON.stringify(value, undefined, space)
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
  return typeof value === 'object' && value !== null && value.hasOwnProperty('toJSON')
}

export function includes(candidate: string, search: string): boolean
export function includes<T>(candidate: T[], search: T): boolean
export function includes(candidate: string | unknown[], search: any) {
  // tslint:disable-next-line: no-unsafe-any
  return candidate.indexOf(search) !== -1
}

export function find<T>(array: T[], predicate: (item: T, index: number, array: T[]) => unknown): T | undefined {
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

/**
 * Get the time since the navigation was started.
 *
 * Note: this does not use `performance.timeOrigin` because it doesn't seem to reflect the actual
 * time on which the navigation has started: it may be much farther in the past, at least in Firefox 71.
 * Related issue in Firefox: https://bugzilla.mozilla.org/show_bug.cgi?id=1429926
 */
export function getRelativeTime(timestamp: number) {
  return timestamp - getNavigationStart()
}

export function getTimestamp(relativeTime: number) {
  return Math.floor(getNavigationStart() + relativeTime)
}

/**
 * Navigation start slightly change on some rare cases
 */
let navigationStart: number | undefined
export function getNavigationStart() {
  if (navigationStart === undefined) {
    navigationStart = performance.timing.navigationStart
  }
  return navigationStart
}

export function objectValues(object: { [key: string]: unknown }) {
  const values: unknown[] = []
  Object.keys(object).forEach((key) => {
    values.push(object[key])
  })
  return values
}

export function objectEntries(object: { [key: string]: unknown }) {
  return Object.keys(object).map((key) => [key, object[key]])
}

export function isEmptyObject(object: object) {
  return Object.keys(object).length === 0
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
      return this
    },
    configurable: true,
  })
  // @ts-ignore
  let globalObject: unknown = _dd_temp_
  // @ts-ignore
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
