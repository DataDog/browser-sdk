import { display, safeTruncate, isExperimentalFeatureEnabled, ExperimentalFeature } from '@datadog/browser-core'
import { NodePrivacyLevel, CENSORED_STRING_MARK, PRIVACY_ATTR_NAME } from './privacyConstants'
import type { RumConfiguration } from './configuration'
import { getNodePrivacyLevel, maskAttributeIfNeeded } from './privacy'
import type { NodePrivacyLevelCache } from './privacy'
import { FILTERED_TAGNAMES } from './getSelectorFromElement'

const HREF_ATTRIBUTE = 'href'
const HREF_TAGNAMES = ['A', 'AREA']

// Attributes masked through the same privacy pipeline as action names: free-form text that can
// carry PII (a user's name, an email address...), already classified this way by
// `shouldMaskAttribute` in `privacy.ts`. `href` is included here too, gated to `<a>`/`<area>`:
// `shouldMaskAttribute` already special-cases `<a href>` the same way.
const MASKED_ATTRIBUTES = ['aria-label', 'name', 'title', 'alt', HREF_ATTRIBUTE]

// Structural/identification attributes: not part of `shouldMaskAttribute`'s masked set, so no
// masking needed beyond the element-level HIDDEN/IGNORE check every attribute already gets.
const PASSTHROUGH_ATTRIBUTES = ['id', 'role']

/**
 * Arbitrary value: this key space is dominated by the unbounded `data-*` wildcard on a single
 * click's ancestor chain (unlike the server-controlled header set that inspired this pattern), so
 * a smaller cap than `filterHeaders`'s `MAX_HEADER_COUNT` is used here.
 */
const MAX_ATTRIBUTE_KEY_COUNT = 20

/**
 * Arbitrary value, consistent with the truncation applied to action names
 * (`getActionNameFromElement`), to avoid a single free-form attribute (ex: a long aria-label)
 * consuming the whole map's character budget.
 */
const ATTRIBUTE_VALUE_LIMIT = 100

/**
 * Extracts a facetable key→value map of attributes (`href`, `aria-label`, `data-*`, `id`, `name`,
 * `role`, `alt`, `title`) from a click's `composedPath()`, so Datadog customers can filter/group
 * RUM click actions by these values.
 *
 * Elements are visited target-first (composedPath's natural order), and the first (closest) value
 * seen for a given key wins — farther ancestors are ignored for that key once it's set.
 *
 * Every value goes through the same privacy pipeline already used to mask action names
 * (`maskAttributeIfNeeded`, backed by `shouldMaskAttribute`): masked under `MASK`/
 * `MASK_UNLESS_ALLOWLISTED`, collected as-is otherwise. No additional, feature-specific content
 * filtering is applied — customers control what leaves the browser through the existing privacy
 * level configuration, the same way they already do for the action name.
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

  function addAttribute(key: string, rawValue: string) {
    if (key in result) {
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

    for (const attributeName of PASSTHROUGH_ATTRIBUTES) {
      const value = element.getAttribute(attributeName)
      if (value) {
        addAttribute(attributeName, value)
      }
    }

    for (const attribute of Array.from(element.attributes)) {
      // `data-dd-privacy` is the SDK's own privacy-level override, not application content:
      // collecting its value (`mask`, `allow`...) would leak an SDK implementation detail into
      // this facet map instead of anything about the click target.
      if (attribute.name === PRIVACY_ATTR_NAME) {
        continue
      }
      // `href` is collected only from `<a>`/`<area>`, matching `shouldMaskAttribute`'s own
      // `<a href>` special case and avoiding a stray `href` attribute on an arbitrary element.
      if (attribute.name === HREF_ATTRIBUTE && !HREF_TAGNAMES.includes(element.tagName)) {
        continue
      }
      if (MASKED_ATTRIBUTES.includes(attribute.name) || attribute.name.startsWith('data-')) {
        const maskedValue = maskAttributeIfNeeded(
          element,
          attribute.name,
          attribute.value,
          configuration,
          nodePrivacyLevelCache,
          CENSORED_STRING_MARK
        )
        if (maskedValue) {
          addAttribute(attribute.name, maskedValue)
        }
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}
