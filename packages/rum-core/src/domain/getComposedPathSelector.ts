import { safeTruncate, ONE_KIBI_BYTE, matchList } from '@datadog/browser-core'
import type { MatchOption } from '@datadog/browser-core'
import { STABLE_ATTRIBUTES, isGeneratedValue, getIDSelector, getTagNameSelector } from './getSelectorFromElement'

const FILTERED_TAGNAMES = ['HTML', 'BODY']

/**
 * arbitrary value, we want to truncate the selector if it exceeds the limit
 */
export const CHARACTER_LIMIT = 2 * ONE_KIBI_BYTE

/**
 * Safe attributes that can be collected without PII concerns.
 * These are commonly used for testing, accessibility, and UI identification.
 */
export const SAFE_ATTRIBUTES = STABLE_ATTRIBUTES.concat([
  'role',
  'type',
  'name',
  'disabled',
  'readonly',
  'checked',
  'selected',
  'tabindex',
  'draggable',
  'target',
  'rel',
  'download',
  'method',
  'action',
  'enctype',
  'autocomplete',
])

/**
 * Extracts a selector string from a MouseEvent composedPath.
 *
 * This function:
 * 1. Filters out non-Element items (Document, Window, ShadowRoot)
 * 2. Extracts a selector string from each element
 * 3. Truncates the selector string if it exceeds the character limit
 * 4. Returns the selector string
 *
 * @param composedPath - The composedPath from a MouseEvent
 * @returns A selector string
 */
export function getComposedPathSelector(
  composedPath: EventTarget[],
  actionNameAttribute: string | undefined,
  attributesAllowList: MatchOption[]
): string {
  // Filter to only include Element nodes
  const elements = composedPath.filter(
    (el): el is Element => el instanceof Element && !FILTERED_TAGNAMES.includes(el.tagName)
  )

  if (elements.length === 0) {
    return ''
  }

  const allowedAttributes = ([] as MatchOption[]).concat(
    actionNameAttribute ? [actionNameAttribute] : [],
    SAFE_ATTRIBUTES,
    attributesAllowList
  )

  let result = ''
  for (let i = 0; i < elements.length; i++) {
    const part = getSelectorStringFromElement(elements[i], allowedAttributes)
    const next = result + part
    if (next.length >= CHARACTER_LIMIT) {
      return safeTruncate(next, CHARACTER_LIMIT)
    }
    result = next
  }
  return result
}

/**
 * Extracts a selector string from an element.
 */
function getSelectorStringFromElement(element: Element, allowedAttributes: MatchOption[]): string {
  const tagName = getTagNameSelector(element)
  const id = getIDSelector(element)
  const classes = getElementClassesString(element)
  const attributes = extractSafeAttributesString(element, allowedAttributes)
  const positionData = computePositionDataString(element)

  return `${tagName}${id || ''}${attributes}${classes}${positionData};`
}

function getElementClassesString(element: Element): string {
  return Array.from(element.classList)
    .filter((c) => c.trim() !== '' && !isGeneratedValue(c))
    .sort()
    .map((c) => `.${CSS.escape(c)}`)
    .join('')
}

/**
 * Computes the nthChild and nthOfType positions for an element.
 *
 * @param element - The element to compute the position data for
 * @returns A string of the form ":nth-child(1):nth-of-type(1)"
 */
function computePositionDataString(element: Element): string {
  const parent = element.parentElement
  if (!parent) {
    return ''
  }

  const siblings = parent.children
  const n = siblings.length
  if (n <= 1) {
    return ''
  }

  let result = ''

  const sameTypeTotal = Array.from(siblings).filter((sibling) => sibling.tagName === element.tagName).length

  for (let i = 0, j = 0; i < n; i++) {
    const currentSibling = siblings[i]
    if (currentSibling.tagName === element.tagName) {
      j++
    }
    if (currentSibling === element) {
      result += `:nth-child(${i + 1})` // 1-based
      if (sameTypeTotal > 1 && j > 0) {
        result += `:nth-of-type(${j})` // 1-based
      }
      break
    }
  }

  return result
}

/**
 * Extracts only the safe (allowlisted) attributes from an element.
 */
function extractSafeAttributesString(element: Element, allowedAttributes: MatchOption[]): string {
  let result = ''
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i]
    if (matchList(allowedAttributes, attr.name)) {
      result += `[${CSS.escape(attr.name)}="${CSS.escape(attr.value)}"]`
    }
  }
  return result
}
