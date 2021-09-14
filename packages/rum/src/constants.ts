import { DefaultPrivacyLevel } from '@datadog/browser-core'

export const NodePrivacyLevel = {
  ...DefaultPrivacyLevel,
  IGNORE: 'ignore',
  HIDDEN: 'hidden',
} as const
export type NodePrivacyLevel = typeof NodePrivacyLevel[keyof typeof NodePrivacyLevel]

export const PRIVACY_ATTR_NAME = 'data-dd-privacy'

// Deprecate via temporary Alias
export const PRIVACY_CLASS_INPUT_IGNORED = 'dd-privacy-input-ignored' // DEPRECATED, aliased to mask-user-input
export const PRIVACY_CLASS_INPUT_MASKED = 'dd-privacy-input-masked' // DEPRECATED, aliased to mask-user-input
export const PRIVACY_ATTR_VALUE_INPUT_IGNORED = 'input-ignored' // DEPRECATED, aliased to mask-user-input
export const PRIVACY_ATTR_VALUE_INPUT_MASKED = 'input-masked' // DEPRECATED, aliased to mask-user-input

// Privacy Attrs
export const PRIVACY_ATTR_VALUE_ALLOW = 'allow'
export const PRIVACY_ATTR_VALUE_MASK = 'mask'
export const PRIVACY_ATTR_VALUE_MASK_USER_INPUT = 'mask-user-input'
export const PRIVACY_ATTR_VALUE_HIDDEN = 'hidden'

// Privacy Classes - not all customers can set plain HTML attributes, so support classes too
export const PRIVACY_CLASS_ALLOW = 'dd-privacy-allow'
export const PRIVACY_CLASS_MASK = 'dd-privacy-mask'
export const PRIVACY_CLASS_MASK_USER_INPUT = 'dd-privacy-mask-user-input'
export const PRIVACY_CLASS_HIDDEN = 'dd-privacy-hidden'

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
