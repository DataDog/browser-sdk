/**
 * Get the action name from the attribute 'data-dd-action-name' on the element or any of its parent.
 * It can also be retrieved from a user defined attribute.
 */
export const DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE = 'data-dd-action-name'
export const ACTION_NAME_PLACEHOLDER = 'Masked Element'
export const ACTION_NAME_MASK = 'xxx'

export const enum ActionNameSource {
  CUSTOM_ATTRIBUTE = 'custom_attribute',
  MASK_PLACEHOLDER = 'mask_placeholder',
  TEXT_CONTENT = 'text_content',
  STANDARD_ATTRIBUTE = 'standard_attribute',
  BLANK = 'blank',
}

export interface ActionName {
  name: string
  nameSource: ActionNameSource
}
