import { display } from './display'
import { startsWith, arrayFrom } from './polyfills'

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
