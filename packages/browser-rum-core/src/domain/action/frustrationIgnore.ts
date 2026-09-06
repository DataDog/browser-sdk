import { getParentElement } from '../../browser/htmlDomUtils'

const FRUSTRATION_IGNORE_ATTRIBUTE = 'data-dd-ignore-frustration'
const ALL_FRUSTRATIONS_IGNORE_VALUE = 'all'
const RAGE_CLICK_IGNORE_VALUE = 'rage-click'
const DEAD_CLICK_IGNORE_VALUE = 'dead-click'
const ERROR_CLICK_IGNORE_VALUE = 'error-click'

export interface FrustrationIgnore {
  rageClick: boolean
  deadClick: boolean
  errorClick: boolean
}

export function getFrustrationIgnore(element: Element): FrustrationIgnore {
  const frustrationIgnore = { rageClick: false, deadClick: false, errorClick: false }
  let currentElement: Element | null = element

  while (currentElement) {
    const attributeValue = currentElement.getAttribute(FRUSTRATION_IGNORE_ATTRIBUTE)
    if (attributeValue !== null) {
      const values = attributeValue.split(/\s+/)
      const ignoreAll = attributeValue.trim() === '' || values.includes(ALL_FRUSTRATIONS_IGNORE_VALUE)
      if (ignoreAll || values.includes(RAGE_CLICK_IGNORE_VALUE)) {
        frustrationIgnore.rageClick = true
      }
      if (ignoreAll || values.includes(DEAD_CLICK_IGNORE_VALUE)) {
        frustrationIgnore.deadClick = true
      }
      if (ignoreAll || values.includes(ERROR_CLICK_IGNORE_VALUE)) {
        frustrationIgnore.errorClick = true
      }
    }
    if (frustrationIgnore.rageClick && frustrationIgnore.deadClick && frustrationIgnore.errorClick) {
      break
    }
    currentElement = getParentElement(currentElement)
  }

  return frustrationIgnore
}
