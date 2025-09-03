import { getParentNode, isElementNode } from '../../browser/htmlDomUtils'

export const CLICK_IGNORE_ATTR_NAME = 'data-dd-click-ignore'

export const ClickIgnoreFlag = {
  RAGE: 1,
  DEAD: 2,
  ERROR: 4,
} as const

export const CLICK_IGNORE_ALL = ClickIgnoreFlag.RAGE | ClickIgnoreFlag.DEAD | ClickIgnoreFlag.ERROR

const cache = new WeakMap<Element, number>()

function parseTokens(value: string): number {
  let mask = 0
  const tokens = value
    .split(/[\s,]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)

  for (const token of tokens) {
    if (token === 'all') {
      return CLICK_IGNORE_ALL
    }
    if (token === 'rage') {
      mask |= ClickIgnoreFlag.RAGE
    } else if (token === 'dead') {
      mask |= ClickIgnoreFlag.DEAD
    } else if (token === 'error') {
      mask |= ClickIgnoreFlag.ERROR
    }
  }
  return mask
}

export function getIgnoredForElement(element: Element): number {
  const cached = cache.get(element)
  if (cached !== undefined) {
    return cached
  }
  let mask = 0
  let node: Node | null = element
  while (node) {
    if (isElementNode(node)) {
      const value = node.getAttribute(CLICK_IGNORE_ATTR_NAME)
      if (value) {
        const parsed = parseTokens(value)
        mask |= parsed
        if ((mask & CLICK_IGNORE_ALL) === CLICK_IGNORE_ALL) {
          break
        }
      }
    }
    node = getParentNode(node)
  }
  cache.set(element, mask)
  return mask
}

