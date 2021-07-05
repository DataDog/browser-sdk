export const enum CensorshipLevel {
  PRIVATE = 'PRIVATE',
  FORMS = 'FORMS',
  PUBLIC = 'PUBLIC',
}

export const enum NodeCensorshipTag {
  // INTERNAL USE:
  NOT_SET = 1, // Not set, use fallback
  UNKNOWN = 2, // Something went wrong, so fallback defensively (eg. textNode without aparent)
  IGNORE = 3, // some tags aren't censored, just ignored, like script tags

  // CUSTOMER APPLIED
  ALLOW = 10, // No censorship whatsoever
  MASK = 11, // General censorship of text + attributes
  HIDDEN = 12, // Supresses everything but dimentions: JS events, attributes, text, input val, node children + depth.

  // SPECIAL: shouldn't be needed by general customers
  MASK_SEALED = 20, // General censorship of text + attributes
}

export const enum InputPrivacyMode {
  NONE = 1,
  IGNORED,
  MASKED,
}

export const PRIVACY_ATTR_NAME = 'data-dd-privacy'

export const PRIVACY_CLASS_ALLOW = 'dd-privacy-allow'
export const PRIVACY_CLASS_HIDDEN = 'dd-privacy-hidden' // TODO: rename to `hide`?

// TODO: New privacy attrs without cooresponding class (for perf?)
export const PRIVACY_ATTR_VALUE_ALLOW = 'allow'
export const PRIVACY_ATTR_VALUE_MASK = 'mask' // TODO: rename to `mask`?
export const PRIVACY_ATTR_VALUE_HIDDEN = 'hidden' // TODO: rename to `hide`?
export const PRIVACY_ATTR_VALUE_MASK_SEALED = 'block-sealed'

export const PRIVACY_ATTR_VALUE_INPUT_IGNORED = 'input-ignored'
export const PRIVACY_ATTR_VALUE_INPUT_MASKED = 'input-masked'
export const PRIVACY_CLASS_INPUT_IGNORED = 'dd-privacy-input-ignored'
export const PRIVACY_CLASS_INPUT_MASKED = 'dd-privacy-input-masked'

export const CENSORED_STRING_MARK = '*****'
export const CENSORED_IMG_MARK = 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='

export const FORM_PRIVATE_TAG_NAMES: { [tagName: string]: true } = {
  INPUT: true,
  SELECT: true,
  TEXTAREA: true,
  DATALIST: true,
  OUPUT: true,
  OPTION: true,
  OPTGROUP: true,
  /*
    We exclude other form related tags
      FORM
      FIELDSET
      LEGEND
      LABEL
      BUTTON
  */
}
