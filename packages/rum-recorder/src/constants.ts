export const enum CensorshipLevel {
  PRIVATE = 'PRIVATE',
  FORMS = 'FORMS',
  PUBLIC = 'PUBLIC',
}

export const enum InputPrivacyMode {
  NONE = 1,
  IGNORED,
  MASKED,
}

export const PRIVACY_ATTR_NAME = 'data-dd-privacy'
export const PRIVACY_ATTR_VALUE_HIDDEN = 'hidden'
export const PRIVACY_ATTR_VALUE_INPUT_IGNORED = 'input-ignored'
export const PRIVACY_ATTR_VALUE_INPUT_MASKED = 'input-masked'

export const PRIVACY_CLASS_HIDDEN = 'dd-privacy-hidden'
export const PRIVACY_CLASS_INPUT_IGNORED = 'dd-privacy-input-ignored'
export const PRIVACY_CLASS_INPUT_MASKED = 'dd-privacy-input-masked'

export const PRIVACY_INPUT_MASK = '*****'

export const FORM_PRIVATE_TAG_NAMES: { [tagName: string]: true } = {
  INPUT: true,
  LABEL: true,
  SELECT: true,
  TEXTAREA: true,
  BUTTON: true,
  FIELDSET: true,
  DATALIST: true,
  OUPUT: true,
  OPTION: true,
  OPTGROUP: true,
  LEGEND: true,
}
