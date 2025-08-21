import { DefaultPrivacyLevel } from '@datadog/browser-core'

export const NodePrivacyLevel = {
  IGNORE: 'ignore',
  HIDDEN: 'hidden',
  ALLOW: DefaultPrivacyLevel.ALLOW,
  MASK: DefaultPrivacyLevel.MASK,
  MASK_USER_INPUT: DefaultPrivacyLevel.MASK_USER_INPUT,
  MASK_UNLESS_ALLOWLISTED: DefaultPrivacyLevel.MASK_UNLESS_ALLOWLISTED,
} as const
export type NodePrivacyLevel = (typeof NodePrivacyLevel)[keyof typeof NodePrivacyLevel]

export const PRIVACY_ATTR_NAME = 'data-dd-privacy'

// Privacy Attrs
export const PRIVACY_ATTR_VALUE_ALLOW = 'allow'
export const PRIVACY_ATTR_VALUE_MASK = 'mask'
export const PRIVACY_ATTR_VALUE_MASK_USER_INPUT = 'mask-user-input'
export const PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED = 'mask-unless-allowlisted'
export const PRIVACY_ATTR_VALUE_HIDDEN = 'hidden'

// Privacy Classes - not all customers can set plain HTML attributes, so support classes too
export const PRIVACY_CLASS_PREFIX = 'dd-privacy-'

// Private Replacement Templates
export const CENSORED_STRING_MARK = '***'
export const CENSORED_IMG_MARK = 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='

export const FORM_PRIVATE_TAG_NAMES: { [tagName: string]: true } = {
  INPUT: true,
  OUTPUT: true,
  TEXTAREA: true,
  SELECT: true,
  OPTION: true,
  DATALIST: true,
  OPTGROUP: true,
}

export const TEXT_MASKING_CHAR = 'x'

export function getPrivacySelector(privacyLevel: string) {
  return `[${PRIVACY_ATTR_NAME}="${privacyLevel}"], .${PRIVACY_CLASS_PREFIX}${privacyLevel}`
}

/**
 * Text censoring non-destructively maintains whitespace characters in order to preserve text shape
 * during replay.
 */
export const censorText = (text: string) => text.replace(/\S/g, TEXT_MASKING_CHAR)
