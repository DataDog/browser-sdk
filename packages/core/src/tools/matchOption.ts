import { display } from './display'
import { getType } from './utils/typeUtils'
import { buildUrl } from './utils/urlPolyfill'

export type MatchOption = string | RegExp | ((value: string) => boolean)
export type MatchMode = 'origin' | 'url-start' | 'url'

export function isMatchOption(item: unknown): item is MatchOption {
  const itemType = getType(item)
  return itemType === 'string' || itemType === 'function' || item instanceof RegExp
}

/**
 * Returns true if value can be matched by at least one of the provided MatchOptions.
 * @param list - Array of MatchOptions to test against
 * @param value - The URL string to test
 * @param matchMode - Controls what part of the URL to match:
 * - 'origin': Extract origin from URL and match exactly
 * - 'url-start': Match if URL starts with the option
 * - 'url': Match the entire URL exactly
 * @deprecated useStartsWith parameter is deprecated, use matchMode instead
 */
export function matchList(list: MatchOption[], value: string, useStartsWith?: boolean): boolean
export function matchList(list: MatchOption[], value: string, matchMode: MatchMode): boolean
export function matchList(
  list: MatchOption[],
  value: string,
  useStartsWithOrMatchMode: boolean | MatchMode = false
): boolean {
  // Handle backward compatibility
  let matchMode: MatchMode
  if (typeof useStartsWithOrMatchMode === 'boolean') {
    matchMode = useStartsWithOrMatchMode ? 'url-start' : 'url'
  } else {
    matchMode = useStartsWithOrMatchMode
  }

  // Extract the appropriate part of the URL based on matchMode
  let valueToMatch = value
  if (matchMode === 'origin') {
    try {
      valueToMatch = buildUrl(value).origin
    } catch {
      // If URL parsing fails, fall back to original value
      valueToMatch = value
    }
  }

  return list.some((item) => {
    try {
      if (typeof item === 'function') {
        return item(valueToMatch)
      } else if (item instanceof RegExp) {
        return item.test(valueToMatch)
      } else if (typeof item === 'string') {
        switch (matchMode) {
          case 'origin':
            return item === valueToMatch
          case 'url-start':
            return value.startsWith(item)
          case 'url':
            return item === value
          default:
            return item === valueToMatch
        }
      }
    } catch (e) {
      display.error(e)
    }
    return false
  })
}
