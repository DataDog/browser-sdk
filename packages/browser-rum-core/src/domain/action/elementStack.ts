import { getParentElement } from '../../browser/htmlDomUtils'

interface ElementWithStack extends Element {
  dd_element_stack?: unknown
}

// API registrations do not mutate the DOM or retain detached elements.
const stacks = new WeakMap<Element, string>()

export function setElementStack(element: Element, stack: string) {
  stacks.set(element, stack)
}

/** Snapshot the closest boundary before application handlers change the DOM. */
export function getElementStack(target: Element): string | undefined {
  for (let element: ElementWithStack | null = target; element; element = getParentElement(element)) {
    // On the same element, prefer the property, then the attribute, then the API registration.
    const stack = element.dd_element_stack
    if (typeof stack === 'string' && stack.trim()) {
      return stack
    }
    const attributeStack = element.getAttribute('data-dd-element-stack')
    if (attributeStack?.trim()) {
      return attributeStack
    }
    const registeredStack = stacks.get(element)
    if (registeredStack) {
      return registeredStack
    }
  }
}
