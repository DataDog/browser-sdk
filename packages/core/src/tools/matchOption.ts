import { startsWith } from './utils/polyfills'
import { display } from './display'
import { getType } from './utils/typeUtils'

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
