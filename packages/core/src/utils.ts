export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * 1000
export const ONE_KILO_BYTE = 1024

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
): () => void {
  const needLeadingExecution = options && options.leading !== undefined ? options.leading : true
  const needTrailingExecution = options && options.trailing !== undefined ? options.trailing : true
  let inWaitPeriod = false
  let hasPendingExecution = false

  return function(this: any) {
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
    setTimeout(() => {
      if (needTrailingExecution && hasPendingExecution) {
        fn.apply(this)
      }
      inWaitPeriod = false
      hasPendingExecution = false
    }, wait)
  }
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

export function includes(candidate: unknown[], search: unknown) {
  return candidate.indexOf(search) !== -1
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

export function getGlobalObject<T>(): T {
  // tslint:disable-next-line: function-constructor no-function-constructor-with-string-args
  return (typeof globalThis === 'object' ? globalThis : Function('return this')()) as T
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
