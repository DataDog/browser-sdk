export const enum CensorshipLevel {
  PRIVATE = 'PRIVATE',
  FORMS = 'FORMS',
  PUBLIC = 'PUBLIC',
}

export const enum NodePrivacyLevelInternal {
  // INTERNAL USE:
  NOT_SET = 1, // Not set, use fallback
  UNKNOWN = 2, // Something went wrong, so fallback defensively (eg. textNode without aparent)
  IGNORE = 3, // some tags aren't censored, just ignored, like script tags

  // CUSTOMER APPLIED
  ALLOW = 10, // No censorship whatsoever
  MASK = 11, // General censorship of text + attributes
  MASK_FORMS_ONLY = 12, // General censorship of text + attributes
  HIDDEN = 13, // Supresses everything but dimentions: JS events, attributes, text, input val, node children + depth.

  // SPECIAL: shouldn't be needed by general customers
  MASK_SEALED = 20, // General censorship of text + attributes
  MASK_FORMS_ONLY_SEALED = 21, // General censorship of text + attributes
}

// Only expose these Privacy levelsto the general codebase
export const enum NodePrivacyLevel {
  IGNORE = 3,
  ALLOW = 10,
  MASK = 11,
  HIDDEN = 13,
  _debug = 99999 // TODO: TODO: remove
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

export const PRIVACY_ATTR_VALUE_MASK_SEALED = 'mask-sealed'
export const PRIVACY_ATTR_VALUE_MASK_FORMS_ONLY_SEALED = 'mask-forms-only-sealed'

// Privacy Classes - not all customers can set plain HTML attributes, so support classes too
export const PRIVACY_CLASS_ALLOW = 'dd-privacy-allow'
export const PRIVACY_CLASS_MASK = 'dd-privacy-mask'
export const PRIVACY_CLASS_MASK_FORMS_ONLY = 'dd-privacy-mask-forms-only'
export const PRIVACY_CLASS_HIDDEN = 'dd-privacy-hidden' // TODO: rename to `hide`?

export const PRIVACY_CLASS_MASK_SEALED = '_unstable-dd-privacy-mask-sealed'
export const PRIVACY_CLASS_MASK_FORMS_ONLY_SEALED = '_unstable-dd-privacy-mask-forms-only-sealed'

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
