import { safeTruncate, ONE_KIBI_BYTE } from '@datadog/browser-core'
import type { MatchOption } from '@datadog/browser-core'
import {
  STABLE_ATTRIBUTES,
  isGeneratedValue,
  getIDSelector,
  getTagNameSelector,
  getNthOfTypeSelector,
  getAttributeValueSelector,
} from './getSelectorFromElement'

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
  'disabled',
  'readonly',
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
export function getComposedPathSelector(composedPath: EventTarget[], actionNameAttribute: string | undefined): string {
  // Filter to only include Element nodes
  const elements = composedPath.filter(
    (el): el is Element => el instanceof Element && !FILTERED_TAGNAMES.includes(el.tagName)
  )

  if (elements.length === 0) {
    return ''
  }

  const allowedAttributes = actionNameAttribute ? [actionNameAttribute].concat(SAFE_ATTRIBUTES) : SAFE_ATTRIBUTES

  let result = ''
  for (const element of elements) {
    const part = getSelectorStringFromElement(element, allowedAttributes)
    result += part
    if (result.length >= CHARACTER_LIMIT) {
      return safeTruncate(result, CHARACTER_LIMIT)
    }
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
    .filter((c) => !isGeneratedValue(c))
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
  const siblings = Array.from(element.parentNode!.children)

  if (siblings.length <= 1) {
    return ''
  }

  const sameTypeSiblings = siblings.filter((sibling) => sibling.tagName === element.tagName)

  const nthChild = siblings.indexOf(element)

  const nthOfType = getNthOfTypeSelector(element)

  return `:nth-child(${nthChild + 1})${sameTypeSiblings.length > 1 ? `:nth-of-type(${nthOfType})` : ''}`
}

/**
 * Extracts only the safe (allowlisted) attributes from an element.
 * The attributes are sorted alphabetically by name.
 */
function extractSafeAttributesString(element: Element, allowedAttributes: MatchOption[]): string {
  const result: string[] = []
  const attributes = Array.from(element.attributes)
  for (const attribute of attributes) {
    if (allowedAttributes.includes(attribute.name)) {
      result.push(getAttributeValueSelector(attribute.name, attribute.value))
    }
  }
  return result.sort().join('')
}
