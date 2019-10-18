import { getCookie, setCookie } from './session'

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>

export const ONE_SECOND = 1000
export const ONE_MINUTE = 60 * 1000
export const ONE_KILO_BYTE = 1024

export enum ResourceKind {
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

// tslint:disable-next-line ban-types
export function throttle<T extends Function>(fn: T, wait: number): T {
  let lastCall = 0
  return (function(this: any) {
    const now = new Date().getTime()
    if (lastCall === 0 || lastCall + wait <= now) {
      lastCall = now
      return fn.apply(this, arguments)
    }
    return
  } as unknown) as T // consider output type has input type
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

  try {
    return JSON.stringify(value, replacer, space)
  } finally {
    if (originalToJSON[0]) {
      ;(value as ObjectWithToJSON).toJSON = originalToJSON[1]
    }
    if (originalProtoToJSON[0]) {
      ;(prototype as ObjectWithToJSON).toJSON = originalProtoToJSON[1]
    }
  }
}

function hasToJSON(value: unknown): value is ObjectWithToJSON {
  return typeof value === 'object' && value !== null && value.hasOwnProperty('toJSON')
}

export function startsWith(candidate: string, search: string) {
  return candidate.indexOf(search) === 0
}

export function includes(candidate: unknown[], search: unknown) {
  return candidate.indexOf(search) !== -1
}

export function areCookiesAuthorized(): boolean {
  if (document.cookie === undefined) {
    return false
  }
  try {
    const testCookieName = 'dd_rum_test'
    setCookie(testCookieName, 'test', 100)
    getCookie(testCookieName)
  } catch (error) {
    console.error(error)
    return false
  }
  return true
}
