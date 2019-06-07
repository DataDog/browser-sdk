import { Context, ContextValue } from './context'

export const ONE_MINUTE = 60 * 1000
export const ONE_KILO_BYTE = 1024

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

export function cache<T>(fn: () => T, duration: number): () => T {
  let value: T
  let expired = true
  return () => {
    if (expired) {
      value = fn()
      expired = false
      setTimeout(() => (expired = true), duration)
    }
    return value
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

export function round(num: number, decimals: 0 | 1 | 2 | 3) {
  return +num.toFixed(decimals)
}

export function withSnakeCaseKeys<T extends ContextValue>(candidate: T): T {
  if (Array.isArray(candidate)) {
    return candidate.map((value: ContextValue) => withSnakeCaseKeys(value)) as T
  }
  if (typeof candidate === 'object') {
    const result: Context = {}
    Object.keys(candidate as Context).forEach((key: string) => {
      result[toSnakeCase(key)] = withSnakeCaseKeys(candidate[key])
    })
    return result as T
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
export function jsonStringify(value: object, replacer?: Array<string | number>, space?: string | number) {
  let originalToJSON: OriginalToJSON = [false, undefined]
  if (hasToJSON(value)) {
    // We need to add a flag and not rely on the truthiness of value.toJSON
    // because it can be set but undefined and that's actually significant.
    originalToJSON = [true, value.toJSON]
    delete value.toJSON
  }

  let originalProtoToJSON: OriginalToJSON = [false, undefined]
  const prototype = Object.getPrototypeOf(value) as object
  if (hasToJSON(prototype)) {
    originalProtoToJSON = [true, prototype.toJSON]
    delete prototype.toJSON
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

function hasToJSON(value: object): value is ObjectWithToJSON {
  return value.hasOwnProperty('toJSON')
}
