import { getParentElement } from '../../browser/htmlDomUtils'

export function getElementStack(target: Element, elementStacks: WeakMap<Element, string>): string | undefined {
  for (let element: Element | null = target; element; element = getParentElement(element)) {
    const stack = elementStacks.get(element)
    if (stack !== undefined) {
      return stack
    }
  }
  return undefined
}
