import { startsWith } from '@datadog/browser-core'
import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  CENSORED_STRING_MARK,
  CENSORED_IMG_MARK,
  STABLE_ATTRIBUTES,
  isLongDataUrl,
  sanitizeDataUrl,
} from '@datadog/browser-rum-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { censoredImageForSize } from './serializationUtils'

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
    if (tagName === 'IMG' && (attributeName === 'src' || attributeName === 'srcset')) {
      // generate image with similar dimension than the original to have the same rendering behaviour
      const image = element as HTMLImageElement
      if (image.naturalWidth > 0) {
        return censoredImageForSize(image.naturalWidth, image.naturalHeight)
      }
      const { width, height } = element.getBoundingClientRect()
      if (width > 0 || height > 0) {
        return censoredImageForSize(width, height)
      }
      // if we can't get the image size, fallback to the censored image
      return CENSORED_IMG_MARK
    }

    // mask source URLs
    if (tagName === 'SOURCE' && (attributeName === 'src' || attributeName === 'srcset')) {
      return CENSORED_IMG_MARK
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

    // mask iframe srcdoc
    if (tagName === 'IFRAME' && attributeName === 'srcdoc') {
      return CENSORED_STRING_MARK
    }
  }

  if (!attributeValue || typeof attributeValue !== 'string') {
    return attributeValue
  }

  // Minimum Fix for customer.
  if (isLongDataUrl(attributeValue)) {
    return sanitizeDataUrl(attributeValue)
  }

  return attributeValue
}
