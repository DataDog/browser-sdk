import { display } from './display'
import { monitor } from './monitor'
import { startsWith, arrayFrom } from './polyfills'

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

export function findCommaSeparatedValue(rawString: string, name: string) {
  const regex = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*([^;]+)`)
  const matches = regex.exec(rawString)
  return matches ? matches[1] : undefined
}

export function safeTruncate(candidate: string, length: number, suffix = '') {
  const lastChar = candidate.charCodeAt(length - 1)
  const isLastCharSurrogatePair = lastChar >= 0xd800 && lastChar <= 0xdbff
  const correctedLength = isLastCharSurrogatePair ? length + 1 : length

  if (candidate.length <= correctedLength) {
    return candidate
  }

  return `${candidate.slice(0, correctedLength)}${suffix}`
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

/**
 * Use 'requestIdleCallback' when available: it will throttle the mutation processing if the
 * browser is busy rendering frames (ex: when frames are below 60fps). When not available, the
 * fallback on 'requestAnimationFrame' will still ensure the mutations are processed after any
 * browser rendering process (Layout, Recalculate Style, etc.), so we can serialize DOM nodes efficiently.
 *
 * Note: check both 'requestIdleCallback' and 'cancelIdleCallback' existence because some polyfills only implement 'requestIdleCallback'.
 */
export function requestIdleCallback(callback: () => void, opts?: { timeout?: number }) {
  if (window.requestIdleCallback && window.cancelIdleCallback) {
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

export type MatchOption = string | RegExp | ((value: string) => boolean)
export function isMatchOption(item: unknown): item is MatchOption {
  const itemType = getType(item)
  return itemType === 'string' || itemType === 'function' || item instanceof RegExp
}
/**
 * Returns true if value can be matched by at least one of the provided MatchOptions.
 * When comparing strings, setting useStartsWith to true will compare the value with the start of
 * the option, instead of requiring an exact match.
 */
export function matchList(list: MatchOption[], value: string, useStartsWith = false): boolean {
  return list.some((item) => {
    try {
      if (typeof item === 'function') {
        return item(value)
      } else if (item instanceof RegExp) {
        return item.test(value)
      } else if (typeof item === 'string') {
        return useStartsWith ? startsWith(value, item) : item === value
      }
    } catch (e) {
      display.error(e)
    }
    return false
  })
}

export function tryToClone(response: Response): Response | undefined {
  try {
    return response.clone()
  } catch (e) {
    // clone can throw if the response has already been used by another instrumentation or is disturbed
    return
  }
}
