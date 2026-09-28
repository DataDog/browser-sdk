import { safeTruncate, ONE_KIBI_BYTE, isExperimentalFeatureEnabled, ExperimentalFeature } from '@datadog/browser-core'
import type { MatchOption } from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'
import { getNodePrivacyLevel, maskDisallowedTextContent, shouldMaskAttribute } from './privacy'
import type { NodePrivacyLevelCache } from './privacy'
import { CENSORED_STRING_MARK, NodePrivacyLevel, PRIVACY_ATTR_NAME } from './privacyConstants'
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
 * Attributes that can contain PII. They are collected behind an experimental flag, and masked
 * with the same privacy rules as the action name. `data-*` attributes are also collected this way.
 */
const MASKABLE_ATTRIBUTES = ['aria-label', 'name', 'title', 'alt']

/**
 * Same limit as the action name
 */
export const ATTRIBUTE_VALUE_LIMIT = 100

interface MaskingContext {
  configuration: RumConfiguration
  nodePrivacyLevelCache: NodePrivacyLevelCache
}

/**
 * Extracts a selector string from a MouseEvent composedPath.
 *
 * This function:
 * 1. Filters out non-Element items (Document, Window, ShadowRoot)
 * 2. Extracts a selector string from each element
 * 3. Truncates the selector string between two tokens if it exceeds the character limit
 * 4. Returns the selector string
 *
 * @param composedPath - The composedPath from a MouseEvent
 * @returns A selector string
 */
export function getComposedPathSelector(composedPath: EventTarget[], configuration: RumConfiguration): string {
  // Filter to only include Element nodes
  const elements = composedPath.filter(
    (el): el is Element => el instanceof Element && !FILTERED_TAGNAMES.includes(el.tagName)
  )

  if (elements.length === 0) {
    return ''
  }

  const { actionNameAttribute } = configuration
  const allowedAttributes = actionNameAttribute ? [actionNameAttribute].concat(SAFE_ATTRIBUTES) : SAFE_ATTRIBUTES
  const masking: MaskingContext | undefined = isExperimentalFeatureEnabled(
    ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES
  )
    ? {
        // The action name attribute is exempted from masking for the action name only
        configuration: { ...configuration, actionNameAttribute: undefined },
        // Shared across the path, so each ancestor privacy level is computed once
        nodePrivacyLevelCache: new Map(),
      }
    : undefined

  let result = ''
  for (const element of elements) {
    const tokens = getSelectorTokensFromElement(element, allowedAttributes, masking)
    tokens.push(';')
    for (const token of tokens) {
      // Truncate between tokens, so an attribute key and value are never split
      if (result.length + token.length > CHARACTER_LIMIT) {
        return result
      }
      result += token
    }
  }
  return result
}

/**
 * Extracts the selector tokens (tag name, id, attributes, classes, position) of an element.
 */
function getSelectorTokensFromElement(
  element: Element,
  allowedAttributes: MatchOption[],
  masking: MaskingContext | undefined
): string[] {
  const tokens = [getTagNameSelector(element)]
  const id = getIDSelector(element)
  if (id) {
    tokens.push(id)
  }
  tokens.push(...extractSafeAttributes(element, allowedAttributes, masking), ...getElementClasses(element))
  const positionData = computePositionDataString(element)
  if (positionData) {
    tokens.push(positionData)
  }
  return tokens
}

function getElementClasses(element: Element): string[] {
  return Array.from(element.classList)
    .filter((c) => !isGeneratedValue(c))
    .sort()
    .map((c) => `.${CSS.escape(c)}`)
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
 * Extracts the safe (allowlisted) attributes from an element, and the maskable attributes when a
 * masking context is provided. The attributes are sorted alphabetically by name.
 */
function extractSafeAttributes(
  element: Element,
  allowedAttributes: MatchOption[],
  masking: MaskingContext | undefined
): string[] {
  const result: string[] = []
  let nodePrivacyLevel: NodePrivacyLevel | undefined
  const attributes = Array.from(element.attributes)
  for (const { name, value } of attributes) {
    if (masking && isMaskableAttribute(element, name)) {
      // Computed lazily: most elements have no maskable attribute
      if (nodePrivacyLevel === undefined) {
        nodePrivacyLevel = getNodePrivacyLevel(
          element,
          masking.configuration.defaultPrivacyLevel,
          masking.nodePrivacyLevelCache
        )
      }
      if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN || nodePrivacyLevel === NodePrivacyLevel.IGNORE) {
        continue
      }
      const maskedValue = shouldMaskAttribute(element.tagName, name, value, nodePrivacyLevel, masking.configuration)
        ? maskDisallowedTextContent(value, CENSORED_STRING_MARK)
        : value
      result.push(getAttributeValueSelector(name, safeTruncate(maskedValue, ATTRIBUTE_VALUE_LIMIT)))
    } else if (allowedAttributes.includes(name)) {
      result.push(getAttributeValueSelector(name, value))
    }
  }
  return result.sort()
}

function isMaskableAttribute(element: Element, name: string): boolean {
  // `shouldMaskAttribute` only masks `href` on HTML `<a>` elements
  if (name === 'href') {
    return element.tagName === 'A'
  }
  return MASKABLE_ATTRIBUTES.includes(name) || (name.startsWith('data-') && name !== PRIVACY_ATTR_NAME)
}
