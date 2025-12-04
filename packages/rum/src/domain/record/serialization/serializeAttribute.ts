import {
  NodePrivacyLevel,
  CENSORED_STRING_MARK,
  CENSORED_IMG_MARK,
  sanitizeIfLongDataUrl,
  shouldMaskAttribute,
} from '@datadog/browser-rum-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { censoredImageForSize } from './serializationUtils'

// TODO: temporarily bump the Session Replay limit to 1Mb for dataUrls
// This limit should be removed after [PANA-2843] is implemented
export const MAX_ATTRIBUTE_VALUE_CHAR_LENGTH = 1_000_000

export function serializeAttribute(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel,
  attributeName: string,
  configuration: RumConfiguration
): string | null {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    // dup condition for direct access case
    return null
  }

  const attributeValue = element.getAttribute(attributeName)
  const tagName = element.tagName
  if (shouldMaskAttribute(tagName, attributeName, attributeValue, nodePrivacyLevel, configuration)) {
    // mask image URLs
    if (tagName === 'IMG') {
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
    if (tagName === 'SOURCE') {
      return CENSORED_IMG_MARK
    }

    return CENSORED_STRING_MARK
  }

  if (!attributeValue) {
    return attributeValue
  }

  return sanitizeIfLongDataUrl(attributeValue, MAX_ATTRIBUTE_VALUE_CHAR_LENGTH)
}
