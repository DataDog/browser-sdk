import { cssEscape, elementMatches } from '@datadog/browser-core'

/**
 * Stable attributes are attributes that are commonly used to identify parts of a UI (ex:
 * component). Those attribute values should not be generated randomly (hardcoded most of the time)
 * and stay the same across deploys. They are not necessarily unique across the document.
 */
const STABLE_ATTRIBUTES = [
  'data-dd-action-name',
  // Common test attributes (list provided by google recorder)
  'data-testid',
  'data-test',
  'data-qa',
  'data-cy',
  'data-test-id',
  'data-qa-id',
  'data-testing',
  // FullStory decorator attributes:
  'data-component',
  'data-element',
  'data-source-file',
]

export function getSelectorsFromElement(element: Element, actionNameAttribute: string | undefined) {
  let attributeSelectors = getStableAttributeSelectors()
  if (actionNameAttribute) {
    attributeSelectors = [(element: Element) => getAttributeSelector(actionNameAttribute, element)].concat(
      attributeSelectors
    )
  }
  return {
    selector: getSelectorFromElement(
      element,
      attributeSelectors.concat(getIDSelector),
      attributeSelectors.concat(getClassSelector)
    ),
  }
}

type GetSelector = (element: Element) => string | undefined

function isGeneratedValue(value: string) {
  // To compute the "URL path group", the backend replaces every URL path parts as a question mark
  // if it thinks the part is an identifier. The condition it uses is to checks whether a digit is
  // present.
  //
  // Here, we use the same strategy: if a the value contains a digit, we consider it generated. This
  // strategy might be a bit naive and fail in some cases, but there are many fallbacks to generate
  // CSS selectors so it should be fine most of the time. We might want to allow customers to
  // provide their own `isGeneratedValue` at some point.
  return /[0-9]/.test(value)
}

function getSelectorFromElement(
  targetElement: Element,
  globallyUniqueSelectorStrategies: GetSelector[],
  uniqueAmongChildrenSelectorStrategies: GetSelector[]
): string {
  const targetElementSelector: string[] = []
  let element: Element | null = targetElement

  while (element && element.nodeName !== 'HTML') {
    const globallyUniqueSelector = findSelector(element, globallyUniqueSelectorStrategies, isSelectorUniqueGlobally)
    if (globallyUniqueSelector) {
      targetElementSelector.unshift(globallyUniqueSelector)
      break
    }

    const uniqueSelectorAmongChildren = findSelector(
      element,
      uniqueAmongChildrenSelectorStrategies,
      isSelectorUniqueAmongChildren
    )
    if (uniqueSelectorAmongChildren) {
      targetElementSelector.unshift(uniqueSelectorAmongChildren)
    } else {
      targetElementSelector.unshift(getPositionSelector(element))
    }

    element = element.parentElement
  }

  return targetElementSelector.join('>')
}

function getIDSelector(element: Element): string | undefined {
  if (element.id && !isGeneratedValue(element.id)) {
    return `#${cssEscape(element.id)}`
  }
}

function getClassSelector(element: Element): string | undefined {
  if (element.tagName === 'BODY') {
    return
  }
  if (element.classList.length > 0) {
    for (let i = 0; i < element.classList.length; i += 1) {
      const className = element.classList[i]
      if (isGeneratedValue(className)) {
        continue
      }

      return `${element.tagName}.${cssEscape(className)}`
    }
  }
}

let stableAttributeSelectorsCache: GetSelector[] | undefined
function getStableAttributeSelectors() {
  if (!stableAttributeSelectorsCache) {
    stableAttributeSelectorsCache = STABLE_ATTRIBUTES.map(
      (attribute) => (element: Element) => getAttributeSelector(attribute, element)
    )
  }
  return stableAttributeSelectorsCache
}

function getAttributeSelector(attributeName: string, element: Element): string | undefined {
  if (element.hasAttribute(attributeName)) {
    return `${element.tagName}[${attributeName}="${cssEscape(element.getAttribute(attributeName)!)}"]`
  }
}

function getPositionSelector(element: Element): string {
  const parent = element.parentElement!
  let sibling = parent.firstElementChild
  let currentIndex = 0
  let elementIndex: number | undefined

  while (sibling) {
    if (sibling.tagName === element.tagName) {
      currentIndex += 1
      if (sibling === element) {
        elementIndex = currentIndex
      }

      if (elementIndex !== undefined && currentIndex > 1) {
        // Performance improvement: avoid iterating over all children, stop as soon as we are sure
        // the element is not alone
        break
      }
    }
    sibling = sibling.nextElementSibling
  }

  return currentIndex === 1 ? element.tagName : `${element.tagName}:nth-of-type(${elementIndex!})`
}

function findSelector(
  element: Element,
  selectorGetters: GetSelector[],
  predicate: (element: Element, selector: string) => boolean
) {
  for (const selectorGetter of selectorGetters) {
    const selector = selectorGetter(element)
    if (selector && predicate(element, selector)) {
      return selector
    }
  }
}

function isSelectorUniqueGlobally(element: Element, selector: string): boolean {
  return element.ownerDocument.body.querySelectorAll(selector).length === 1
}

function isSelectorUniqueAmongChildren(element: Element, selector: string): boolean {
  for (let i = 0; i < element.parentElement!.children.length; i++) {
    const sibling = element.parentElement!.children[i]
    if (sibling !== element && elementMatches(sibling, selector)) {
      return false
    }
  }
  return true
}
