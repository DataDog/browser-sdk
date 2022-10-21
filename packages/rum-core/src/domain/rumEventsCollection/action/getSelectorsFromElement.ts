import { cssEscape } from '@datadog/browser-core'
import { DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE } from './getActionNameFromElement'

/**
 * Stable attributes are attributes that are commonly used to identify parts of a UI (ex:
 * component). Those attribute values should not be generated randomly (hardcoded most of the time)
 * and stay the same across deploys. They are not necessarily unique across the document.
 */
export const STABLE_ATTRIBUTES = [
  DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE,
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
  const globallyUniqueSelectorStrategies = attributeSelectors.concat(getIDSelector)
  const uniqueAmongChildrenSelectorStrategies = attributeSelectors.concat([getClassSelector, getTagNameSelector])
  return {
    selector: getSelectorFromElement(element, globallyUniqueSelectorStrategies, uniqueAmongChildrenSelectorStrategies),
    selector_combined: getSelectorFromElement(
      element,
      globallyUniqueSelectorStrategies,
      uniqueAmongChildrenSelectorStrategies,
      { useCombinedSelectors: true }
    ),
    selector_stopping_when_unique: getSelectorFromElement(
      element,
      globallyUniqueSelectorStrategies.concat([getClassSelector, getTagNameSelector]),
      uniqueAmongChildrenSelectorStrategies
    ),
    selector_all_together: getSelectorFromElement(
      element,
      globallyUniqueSelectorStrategies.concat([getClassSelector, getTagNameSelector]),
      uniqueAmongChildrenSelectorStrategies,
      { useCombinedSelectors: true }
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
  uniqueAmongChildrenSelectorStrategies: GetSelector[],
  { useCombinedSelectors = false } = {}
): string {
  let targetElementSelector = ''
  let element: Element | null = targetElement

  while (element && element.nodeName !== 'HTML') {
    const globallyUniqueSelector = findSelector(
      element,
      globallyUniqueSelectorStrategies,
      isSelectorUniqueGlobally,
      useCombinedSelectors ? targetElementSelector : undefined
    )
    if (globallyUniqueSelector) {
      return combineSelector(globallyUniqueSelector, targetElementSelector)
    }

    const uniqueSelectorAmongChildren = findSelector(
      element,
      uniqueAmongChildrenSelectorStrategies,
      isSelectorUniqueAmongSiblings,
      useCombinedSelectors ? targetElementSelector : undefined
    )
    targetElementSelector = combineSelector(
      uniqueSelectorAmongChildren || getPositionSelector(element) || getTagNameSelector(element),
      targetElementSelector
    )

    element = element.parentElement
  }

  return targetElementSelector
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

function getTagNameSelector(element: Element): string {
  return element.tagName
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

function getPositionSelector(element: Element): string | undefined {
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

  return currentIndex > 1 ? `${element.tagName}:nth-of-type(${elementIndex!})` : undefined
}

function findSelector(
  element: Element,
  selectorGetters: GetSelector[],
  predicate: (element: Element, selector: string) => boolean,
  childSelector?: string
) {
  for (const selectorGetter of selectorGetters) {
    const elementSelector = selectorGetter(element)
    const fullSelector = elementSelector && combineSelector(elementSelector, childSelector)
    if (fullSelector && predicate(element, fullSelector)) {
      return elementSelector
    }
  }
}

/**
 * Check whether the selector is unique among the whole document.
 */
function isSelectorUniqueGlobally(element: Element, selector: string): boolean {
  return element.ownerDocument.querySelectorAll(selector).length === 1
}

/**
 * Check whether the selector is unique among the element siblings. In other words, it returns true
 * if "ELEMENT_PARENT > SELECTOR" returns a single element.
 *
 * The result will be less accurate on browsers that don't support :scope (i. e. IE): it will check
 * for any element matching the selector contained in the parent (in other words,
 * "ELEMENT_PARENT SELECTOR" returns a single element), regardless of whether the selector is a
 * direct descendent of the element parent. This should not impact results too much: if it
 * inaccurately returns false, we'll just fall back to another strategy.
 */
function isSelectorUniqueAmongSiblings(element: Element, selector: string): boolean {
  return (
    element.parentElement!.querySelectorAll(supportScopeSelector() ? combineSelector(':scope', selector) : selector)
      .length === 1
  )
}

function combineSelector(parent: string, child: string | undefined): string {
  return child ? `${parent}>${child}` : parent
}

let supportScopeSelectorCache: boolean | undefined
export function supportScopeSelector() {
  if (supportScopeSelectorCache === undefined) {
    try {
      document.querySelector(':scope')
      supportScopeSelectorCache = true
    } catch {
      supportScopeSelectorCache = false
    }
  }
  return supportScopeSelectorCache
}
