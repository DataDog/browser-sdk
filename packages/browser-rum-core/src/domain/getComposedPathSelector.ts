import { safeTruncate, isExperimentalFeatureEnabled, ExperimentalFeature } from '@datadog/browser-core'
import { ONE_KIBI_BYTE } from '@datadog/js-core/util'
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
  'enctype',
  'autocomplete',
])

/**
 * Attributes that can contain PII. They are collected behind an experimental flag, and masked
 * with `shouldMaskAttribute` according to the node privacy level, whatever the value of
 * `enablePrivacyForActionName`. `data-*` attributes, except the stable and generated ones, are also
 * collected this way.
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
 * 2. Extracts the selector tokens of each element, with masked attribute values when needed
 * 3. Truncates the selector string between two tokens if it exceeds the character limit
 * 4. Returns the selector string
 *
 * @param composedPath - The composedPath from a MouseEvent
 * @param configuration - The RUM configuration, for the action name attribute and the privacy level
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
        // Unlike the action name and session replay, do not exempt the action name attribute from masking
        configuration: { ...configuration, actionNameAttribute: undefined },
        // Shared across the path, so each ancestor privacy level is computed once
        nodePrivacyLevelCache: new Map(),
      }
    : undefined

  let result = ''
  for (const element of elements) {
    for (const token of getSelectorTokensFromElement(element, allowedAttributes, masking)) {
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
 * Extracts the selector tokens (tag name, id, attributes, classes, position) of an element,
 * followed by the `;` separator. Missing tokens are empty strings.
 */
function getSelectorTokensFromElement(
  element: Element,
  allowedAttributes: MatchOption[],
  masking: MaskingContext | undefined
): string[] {
  return [getTagNameSelector(element), getIDSelector(element) || ''].concat(
    extractAttributes(element, allowedAttributes, masking),
    getElementClasses(element),
    computePositionDataString(element),
    ';'
  )
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
 * masking context is provided. The attributes are sorted by their selector string.
 */
function extractAttributes(
  element: Element,
  allowedAttributes: MatchOption[],
  masking: MaskingContext | undefined
): string[] {
  const result: string[] = []
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name
    if (masking && isMaskableAttribute(element, name, allowedAttributes)) {
      const nodePrivacyLevel = getNodePrivacyLevel(
        element,
        masking.configuration.defaultPrivacyLevel,
        masking.nodePrivacyLevelCache
      )
      if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN || nodePrivacyLevel === NodePrivacyLevel.IGNORE) {
        continue
      }
      let value = attribute.value
      if (shouldMaskAttribute(element.tagName, name, value, nodePrivacyLevel, masking.configuration)) {
        // Only the mask-unless-allowlisted level uses the allowlist, like the action name text
        value =
          nodePrivacyLevel === NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED
            ? maskDisallowedTextContent(value, CENSORED_STRING_MARK)
            : CENSORED_STRING_MARK
      }
      // Unlike the allowlisted names, `data-*` names can contain separators: escape them
      result.push(getAttributeValueSelector(CSS.escape(name), safeTruncate(value, ATTRIBUTE_VALUE_LIMIT)))
    } else if (allowedAttributes.includes(name)) {
      result.push(getAttributeValueSelector(name, attribute.value))
    }
  }
  return result.sort()
}

function isMaskableAttribute(element: Element, name: string, allowedAttributes: MatchOption[]): boolean {
  // `shouldMaskAttribute` only masks `href` on HTML `<a>` elements
  if (name === 'href') {
    return element.tagName === 'A'
  }
  if (name.startsWith('data-')) {
    // `shouldMaskAttribute` never masks the privacy and stable attributes, so stable attributes stay
    // safe attributes. Generated names (ex: Vue `data-v-<hash>`) are skipped like generated classes,
    // except the action name attribute, which stays masked.
    return (
      name !== PRIVACY_ATTR_NAME &&
      !STABLE_ATTRIBUTES.includes(name) &&
      (!isGeneratedValue(name) || allowedAttributes.includes(name))
    )
  }
  return MASKABLE_ATTRIBUTES.includes(name)
}
