import { safeTruncate, ONE_KIBI_BYTE, isExperimentalFeatureEnabled, ExperimentalFeature } from '@datadog/browser-core'
import type { MatchOption } from '@datadog/browser-core'
import { normalizeUrl, buildUrl } from '@datadog/js-core/util'
import {
  STABLE_ATTRIBUTES,
  isGeneratedValue,
  getIDSelector,
  getTagNameSelector,
  getNthOfTypeSelector,
  getAttributeValueSelector,
} from './getSelectorFromElement'
import type { RumConfiguration } from './configuration'
import { getNodePrivacyLevel, shouldMaskAttribute, maskDisallowedTextContent } from './privacy'
import type { NodePrivacyLevelCache } from './privacy'
import { CENSORED_STRING_MARK } from './privacyConstants'

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
 * Attributes that can help identify an element but may carry PII, so they need extra treatment
 * before being collected. `href` is reduced to its origin and a generated-segment-free path,
 * dropping the query string, hash and any non-http(s) payload (ex: `mailto:`, `data:`), so the
 * value is safe regardless of the privacy level in effect. `aria-label` is free-form text, so it
 * goes through the same masking pipeline as action names. Collected only behind the
 * `composed_path_selector_attributes` experimental flag while we validate cardinality and PII
 * exposure on real traffic.
 */
const HREF_ATTRIBUTE = 'href'
const ARIA_LABEL_ATTRIBUTE = 'aria-label'

/**
 * Arbitrary value, consistent with the truncation applied to action names, to avoid a single
 * free-form attribute (ex: a long aria-label) consuming the whole selector character budget.
 */
const ATTRIBUTE_VALUE_LIMIT = 100

// Matches an explicit scheme (ex: "https:", "mailto:") or a protocol-relative prefix ("//").
const ABSOLUTE_URL = /^[A-Za-z][A-Za-z0-9+.-]*:|^\/\//
// Matches the scheme at the start of a URL, if any.
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/

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
 * @param configuration - The RUM configuration, used to resolve the action name attribute and the
 * privacy settings applied to the PII-sensitive attributes.
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
  // Shared across the whole composedPath: elements are visited target-first, and privacy levels
  // are derived from ancestors, so this cache turns most lookups into O(1) hits.
  const nodePrivacyLevelCache: NodePrivacyLevelCache = new Map()

  let result = ''
  for (const element of elements) {
    const part = getSelectorStringFromElement(element, allowedAttributes, configuration, nodePrivacyLevelCache)
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
function getSelectorStringFromElement(
  element: Element,
  allowedAttributes: MatchOption[],
  configuration: RumConfiguration,
  nodePrivacyLevelCache: NodePrivacyLevelCache
): string {
  const tagName = getTagNameSelector(element)
  const id = getIDSelector(element)
  const classes = getElementClassesString(element)
  const attributes = extractSafeAttributesString(element, allowedAttributes)
  const sensitiveAttributes = extractPrivacySensitiveAttributesString(element, configuration, nodePrivacyLevelCache)
  const positionData = computePositionDataString(element)

  return `${tagName}${id || ''}${attributes}${sensitiveAttributes}${classes}${positionData};`
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

/**
 * Extracts the PII-sensitive attributes (`href`, `aria-label`) from an element, sanitizing and/or
 * masking them as needed. Returns an empty string unless the `composed_path_selector_attributes`
 * experimental flag is enabled.
 */
function extractPrivacySensitiveAttributesString(
  element: Element,
  configuration: RumConfiguration,
  nodePrivacyLevelCache: NodePrivacyLevelCache
): string {
  if (!isExperimentalFeatureEnabled(ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES)) {
    return ''
  }

  const result: string[] = []

  const sanitizedHref = getSanitizedHref(element)
  if (sanitizedHref !== undefined) {
    const value = maskIfNeeded(element, HREF_ATTRIBUTE, sanitizedHref, configuration, nodePrivacyLevelCache)
    result.push(getAttributeValueSelector(HREF_ATTRIBUTE, safeTruncate(value, ATTRIBUTE_VALUE_LIMIT)))
  }

  const ariaLabel = element.getAttribute(ARIA_LABEL_ATTRIBUTE)
  if (ariaLabel) {
    const normalized = ariaLabel.replace(/\s+/g, ' ').trim()
    if (normalized) {
      const value = maskIfNeeded(element, ARIA_LABEL_ATTRIBUTE, normalized, configuration, nodePrivacyLevelCache)
      result.push(getAttributeValueSelector(ARIA_LABEL_ATTRIBUTE, safeTruncate(value, ATTRIBUTE_VALUE_LIMIT)))
    }
  }

  return result.sort().join('')
}

/**
 * Masks an attribute value when the element's privacy level requires it, mirroring how action
 * names are masked (`getActionNameFromStandardAttribute`). `href` is always evaluated as if it
 * were on an anchor, since we want the same masking behavior regardless of the element carrying
 * it (ex: `area`, `link`, `use`).
 */
function maskIfNeeded(
  element: Element,
  attributeName: string,
  attributeValue: string,
  configuration: RumConfiguration,
  nodePrivacyLevelCache: NodePrivacyLevelCache
): string {
  if (!configuration.enablePrivacyForActionName) {
    return attributeValue
  }
  const nodePrivacyLevel = getNodePrivacyLevel(element, configuration.defaultPrivacyLevel, nodePrivacyLevelCache)
  const tagName = attributeName === HREF_ATTRIBUTE ? 'A' : element.tagName
  if (shouldMaskAttribute(tagName, attributeName, attributeValue, nodePrivacyLevel, configuration)) {
    return maskDisallowedTextContent(attributeValue, CENSORED_STRING_MARK)
  }
  return attributeValue
}

/**
 * Returns a PII-safe representation of an element's `href`, or `undefined` if the element has no
 * `href` or it cannot be parsed as a URL.
 *
 * The query string, hash and any userinfo are always dropped. Non-http(s) schemes (`mailto:`,
 * `tel:`, `javascript:`, `data:`...) are reduced to the scheme alone, since their payload can
 * contain arbitrary PII (an email address, a phone number...). For http(s) URLs, path segments
 * that look generated (ex: containing a digit, following the same heuristic used for CSS ids and
 * classes in this file) are replaced by `?`, mirroring how the backend groups URL paths. The
 * origin is only included when the attribute itself was written as an absolute (or
 * protocol-relative) URL, to avoid implying a page navigates cross-origin when it doesn't.
 */
function getSanitizedHref(element: Element): string | undefined {
  const rawHref = element.getAttribute(HREF_ATTRIBUTE)
  if (!rawHref) {
    return undefined
  }

  const schemeMatch = URL_SCHEME.exec(rawHref)
  if (schemeMatch && !/^https?:$/i.test(schemeMatch[0])) {
    return schemeMatch[0].toLowerCase()
  }

  let url: URL
  try {
    url = buildUrl(normalizeUrl(rawHref))
  } catch {
    return undefined
  }

  const groupedPath = groupUrlPath(url.pathname)

  return ABSOLUTE_URL.test(rawHref) ? `${url.origin}${groupedPath}` : groupedPath
}

function groupUrlPath(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => (isGeneratedValue(segment) ? '?' : segment))
    .join('/')
}
