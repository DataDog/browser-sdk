import { getParentElement } from '../../browser/htmlDomUtils'

const FRUSTRATION_IGNORE_ATTRIBUTE = 'data-dd-ignore-frustration'
const ALL_FRUSTRATIONS_IGNORE_VALUE = 'all'
const RAGE_CLICK_IGNORE_VALUE = 'rage-click'
const DEAD_CLICK_IGNORE_VALUE = 'dead-click'
const ERROR_CLICK_IGNORE_VALUE = 'error-click'

export const enum FrustrationIgnore {
  NONE = 0,
  RAGE_CLICK = 1,
  DEAD_CLICK = 2,
  ERROR_CLICK = 4,
  ALL = 7,
}

export function shouldIgnore(ignoredFrustrations: FrustrationIgnore, frustration: FrustrationIgnore) {
  // eslint-disable-next-line no-bitwise
  return (ignoredFrustrations & frustration) !== 0
}

export function getFrustrationIgnore(element: Element): FrustrationIgnore {
  let frustrationIgnore = FrustrationIgnore.NONE
  let currentElement: Element | null = element

  while (currentElement) {
    const attributeValue = currentElement.getAttribute(FRUSTRATION_IGNORE_ATTRIBUTE)
    if (attributeValue !== null) {
      const values = attributeValue.split(/\s+/)
      const ignoreAll = attributeValue.trim() === '' || values.includes(ALL_FRUSTRATIONS_IGNORE_VALUE)
      if (ignoreAll) {
        return FrustrationIgnore.ALL
      }
      if (values.includes(RAGE_CLICK_IGNORE_VALUE)) {
        // eslint-disable-next-line no-bitwise
        frustrationIgnore |= FrustrationIgnore.RAGE_CLICK
      }
      if (values.includes(DEAD_CLICK_IGNORE_VALUE)) {
        // eslint-disable-next-line no-bitwise
        frustrationIgnore |= FrustrationIgnore.DEAD_CLICK
      }
      if (values.includes(ERROR_CLICK_IGNORE_VALUE)) {
        // eslint-disable-next-line no-bitwise
        frustrationIgnore |= FrustrationIgnore.ERROR_CLICK
      }
    }
    if (frustrationIgnore === FrustrationIgnore.ALL) {
      break
    }
    currentElement = getParentElement(currentElement)
  }

  return frustrationIgnore
}
