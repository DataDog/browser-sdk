export const enum InitialPrivacyLevel {
  ALLOW = 'ALLOW',
  MASK = 'MASK',
  MASK_FORMS_ONLY = 'MASK_FORMS_ONLY',
  HIDDEN = 'HIDDEN',
}

export const enum NodePrivacyLevelInternal {
  // INTERNAL USE:
  NOT_SET = 1,
  UNKNOWN = 2,
  IGNORE = 3,

  // CUSTOMER APPLIED
  ALLOW = 10,
  MASK = 11,
  MASK_FORMS_ONLY = 12,
  HIDDEN = 13,
}

// Only expose these Privacy levelsto the general codebase
export const enum NodePrivacyLevel {
  // REVIEW: Is there any better way to subset or extend `NodePrivacyLevel` here?
  IGNORE = 3,
  ALLOW = 10,
  MASK = 11,
  HIDDEN = 13,
}

export const PRIVACY_ATTR_NAME = 'data-dd-privacy'

// Deprecate via temporariy Alias
export const PRIVACY_CLASS_INPUT_IGNORED = 'dd-privacy-input-ignored' // DEPRECATED, aliased to mask-forms-only
export const PRIVACY_CLASS_INPUT_MASKED = 'dd-privacy-input-masked' // DEPRECATED, aliased to mask-forms-only
export const PRIVACY_ATTR_VALUE_INPUT_IGNORED = 'input-ignored' // DEPRECATED, aliased to mask-forms-only
export const PRIVACY_ATTR_VALUE_INPUT_MASKED = 'input-masked' // DEPRECATED, aliased to mask-forms-only

// Privacy Attrs
export const PRIVACY_ATTR_VALUE_ALLOW = 'allow'
export const PRIVACY_ATTR_VALUE_MASK = 'mask'
export const PRIVACY_ATTR_VALUE_MASK_FORMS_ONLY = 'mask-forms-only'
export const PRIVACY_ATTR_VALUE_HIDDEN = 'hidden' // TODO: rename to `hide`?

// Privacy Classes - not all customers can set plain HTML attributes, so support classes too
export const PRIVACY_CLASS_ALLOW = 'dd-privacy-allow'
export const PRIVACY_CLASS_MASK = 'dd-privacy-mask'
export const PRIVACY_CLASS_MASK_FORMS_ONLY = 'dd-privacy-mask-forms-only'
export const PRIVACY_CLASS_HIDDEN = 'dd-privacy-hidden' // TODO: rename to `hide`?

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
