import { startsWith } from '@datadog/browser-core'
import { STABLE_ATTRIBUTES } from '@datadog/browser-rum-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { NodePrivacyLevel, PRIVACY_ATTR_NAME, CENSORED_STRING_MARK, CENSORED_IMG_MARK } from '../../../constants'
import { MAX_ATTRIBUTE_VALUE_CHAR_LENGTH } from '../privacy'

export function serializeAttribute(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel,
  attributeName: string,
  configuration: RumConfiguration
): string | number | boolean | null {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    // dup condition for direct access case
    return null
  }
  const attributeValue = element.getAttribute(attributeName)
  if (
    nodePrivacyLevel === NodePrivacyLevel.MASK &&
    attributeName !== PRIVACY_ATTR_NAME &&
    !STABLE_ATTRIBUTES.includes(attributeName) &&
    attributeName !== configuration.actionNameAttribute
  ) {
    const tagName = element.tagName

    switch (attributeName) {
      // Mask Attribute text content
      case 'title':
      case 'alt':
      case 'placeholder':
        return CENSORED_STRING_MARK
    }
    // mask image URLs
    if (tagName === 'IMG' || tagName === 'SOURCE') {
      if (attributeName === 'src' || attributeName === 'srcset') {
        return CENSORED_IMG_MARK
      }
    }
    // mask <a> URLs
    if (tagName === 'A' && attributeName === 'href') {
      return CENSORED_STRING_MARK
    }

    // mask data-* attributes
    if (attributeValue && startsWith(attributeName, 'data-')) {
      // Exception: it's safe to reveal the `${PRIVACY_ATTR_NAME}` attr
      return CENSORED_STRING_MARK
    }
  }

  if (!attributeValue || typeof attributeValue !== 'string') {
    return attributeValue
  }

  // Minimum Fix for customer.
  if (attributeValue.length > MAX_ATTRIBUTE_VALUE_CHAR_LENGTH && attributeValue.slice(0, 5) === 'data:') {
    return 'data:truncated'
  }

  return attributeValue
}
