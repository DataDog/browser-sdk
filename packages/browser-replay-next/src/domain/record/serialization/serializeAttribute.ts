import {
  NodePrivacyLevel,
  CENSORED_STRING_MARK,
  CENSORED_IMG_MARK,
  shouldMaskAttribute,
} from '../../privacy'
import type { ReplayConfig } from '../../configuration'
import { censoredImageForSize } from './serializationUtils'

// TODO: temporarily bump the Session Replay limit to 1Mb for dataUrls
// This limit should be removed after [PANA-2843] is implemented
export const MAX_ATTRIBUTE_VALUE_CHAR_LENGTH = 1_000_000

// Inlined from @datadog/browser-rum-core sanitizeIfLongDataUrl
const DATA_URL_REGEX = /^data:([^;,]+)[;,]/i
function sanitizeIfLongDataUrl(url: string, lengthLimit: number): string {
  if (url.length <= lengthLimit || !url.startsWith('data:')) {
    return url
  }
  // truncate url first to a random length to prevent match error when the url is too long
  const dataUrlMatchArray = url.substring(0, 100).match(DATA_URL_REGEX)
  if (!dataUrlMatchArray) {
    return url
  }
  return `${dataUrlMatchArray[0]}[...]`
}

export function serializeAttribute(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel,
  attributeName: string,
  // configuration is kept for API compatibility with the original rum package signature
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _configuration: ReplayConfig
): string | null {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    // dup condition for direct access case
    return null
  }

  const attributeValue = element.getAttribute(attributeName)
  const tagName = element.tagName
  if (shouldMaskAttribute(tagName, attributeName, attributeValue, nodePrivacyLevel)) {
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
