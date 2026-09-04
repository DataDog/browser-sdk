import { display, safeTruncate, isExperimentalFeatureEnabled, ExperimentalFeature } from '@datadog/browser-core'
import { NodePrivacyLevel, CENSORED_STRING_MARK, PRIVACY_ATTR_NAME } from './privacyConstants'
import type { RumConfiguration } from './configuration'
import { getNodePrivacyLevel, maskAttributeIfNeeded } from './privacy'
import type { NodePrivacyLevelCache } from './privacy'
import { isGeneratedValue, FILTERED_TAGNAMES } from './getSelectorFromElement'
import { getSanitizedHref, HREF_ATTRIBUTE, ATTRIBUTE_VALUE_LIMIT } from './urlSanitizer'

const HREF_TAGNAMES = ['A', 'AREA']

// Attributes masked through the same privacy pipeline as action names: free-form text that can
// carry PII (a user's name, an email address...), already classified this way by
// `shouldMaskAttribute` in `privacy.ts`.
const MASKED_TEXT_ATTRIBUTES = ['aria-label', 'name', 'title', 'alt']

// Structural/identification attributes: not part of `shouldMaskAttribute`'s masked set, so no
// masking needed beyond the element-level HIDDEN/IGNORE check every attribute already gets.
const PASSTHROUGH_ATTRIBUTES = ['id', 'role']

/**
 * Arbitrary value: this key space is dominated by the unbounded `data-*` wildcard on a single
 * click's ancestor chain (unlike the server-controlled header set that inspired this pattern), so
 * a smaller cap than `filterHeaders`'s `MAX_HEADER_COUNT` is used here.
 */
const MAX_ATTRIBUTE_KEY_COUNT = 20

// Matches an email address anywhere in the value (ex: a mailto-style label, a "Contact
// jane@example.com" aria-label), not just a value that's an email in its entirety.
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/

/**
 * A last-resort content check applied on top of the existing privacy-level masking:
 * `maskAttributeIfNeeded` only masks free-form text under `MASK`/`MASK_UNLESS_ALLOWLISTED`, so at
 * `ALLOW`/`MASK_USER_INPUT` (the default) a raw attribute value would otherwise pass straight
 * through, email addresses included. The email check applies to every attribute.
 *
 * The digit check (`isGeneratedValue`, the same heuristic already used to exclude generated
 * ids/classes/URL path segments elsewhere in this domain) only applies to `MASKED_TEXT_ATTRIBUTES`
 * (free-form, human-authored text most likely to embed a raw identifier such as a phone number
 * when unmasked). It's intentionally not applied to `id`, `role`, or `data-*`: those are
 * structural/identifier-style attributes where digits are the common, wanted case (product ids,
 * SKUs, test ids), and dropping them entirely would throw away exactly the values customers asked
 * for this feature to expose.
 */
function isSafeToCollect(value: string, checkDigits: boolean): boolean {
  if (EMAIL_PATTERN.test(value)) {
    return false
  }
  return !checkDigits || !isGeneratedValue(value)
}

/**
 * Extracts a facetable key→value map of attributes (`href`, `aria-label`, `data-*`, `id`, `name`,
 * `role`, `alt`, `title`) from a click's `composedPath()`, so Datadog customers can filter/group
 * RUM click actions by these values.
 *
 * Elements are visited target-first (composedPath's natural order), and the first (closest) value
 * seen for a given key wins — farther ancestors are ignored for that key once it's set.
 *
 * Every value is dropped if it contains an email address, regardless of privacy level or attribute
 * type. Values of `aria-label`, `name`, `title`, and `alt` are additionally dropped if they contain
 * a digit, since those are free-form text that can carry a raw identifier when unmasked (see
 * `isSafeToCollect`). `id`, `role`, and `data-*` are exempt from the digit check: digits are the
 * common, wanted case there (product ids, SKUs, test ids).
 *
 * Returns `undefined` unless the `composed_path_selector_attributes_map` experimental flag is
 * enabled, or if the resulting map ends up empty.
 */
export function getComposedPathAttributes(
  composedPath: EventTarget[],
  configuration: RumConfiguration,
  nodePrivacyLevelCache: NodePrivacyLevelCache
): Record<string, string> | undefined {
  if (!isExperimentalFeatureEnabled(ExperimentalFeature.COMPOSED_PATH_SELECTOR_ATTRIBUTES_MAP)) {
    return undefined
  }

  const elements = composedPath.filter(
    (el): el is Element => el instanceof Element && !FILTERED_TAGNAMES.includes(el.tagName)
  )

  const result: Record<string, string> = {}
  let collectedKeyCount = 0
  let hasReachedMaxKeyCount = false

  function addAttribute(key: string, rawValue: string, checkDigits: boolean) {
    if (key in result) {
      return
    }
    if (!isSafeToCollect(rawValue, checkDigits)) {
      return
    }
    if (collectedKeyCount >= MAX_ATTRIBUTE_KEY_COUNT) {
      if (!hasReachedMaxKeyCount) {
        display.warn(
          `Maximum number of composed path attributes (${MAX_ATTRIBUTE_KEY_COUNT}) has been reached. Further attributes are dropped.`
        )
        hasReachedMaxKeyCount = true
      }
      return
    }
    result[key] = safeTruncate(rawValue, ATTRIBUTE_VALUE_LIMIT)
    collectedKeyCount++
  }

  for (const element of elements) {
    const nodePrivacyLevel = getNodePrivacyLevel(element, configuration.defaultPrivacyLevel, nodePrivacyLevelCache)
    if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN || nodePrivacyLevel === NodePrivacyLevel.IGNORE) {
      continue
    }

    if (HREF_TAGNAMES.includes(element.tagName)) {
      const sanitizedHref = getSanitizedHref(element)
      if (sanitizedHref !== undefined) {
        addAttribute(HREF_ATTRIBUTE, sanitizedHref, false)
      }
    }

    for (const attributeName of PASSTHROUGH_ATTRIBUTES) {
      const value = element.getAttribute(attributeName)
      if (value) {
        addAttribute(attributeName, value, false)
      }
    }

    for (const attribute of Array.from(element.attributes)) {
      // `data-dd-privacy` is the SDK's own privacy-level override, not application content:
      // collecting its value (`mask`, `allow`...) would leak an SDK implementation detail into
      // this facet map instead of anything about the click target.
      if (attribute.name === PRIVACY_ATTR_NAME) {
        continue
      }
      const isMaskedTextAttribute = MASKED_TEXT_ATTRIBUTES.includes(attribute.name)
      if (isMaskedTextAttribute || attribute.name.startsWith('data-')) {
        const maskedValue = maskAttributeIfNeeded(
          element,
          attribute.name,
          attribute.value,
          configuration,
          nodePrivacyLevelCache,
          CENSORED_STRING_MARK
        )
        if (maskedValue) {
          addAttribute(attribute.name, maskedValue, isMaskedTextAttribute)
        }
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}
