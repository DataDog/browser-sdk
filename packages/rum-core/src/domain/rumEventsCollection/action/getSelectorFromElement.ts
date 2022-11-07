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

type SelectorGetter = (element: Element, actionNameAttribute: string | undefined) => string | undefined

// Selectors to use if they target a single element on the whole document. Those selectors are
// considered as "stable" and uniquely identify an element regardless of the page state. If we find
// one, we should consider the selector "complete" and stop iterating over ancestors.
const GLOBALLY_UNIQUE_SELECTOR_GETTERS: SelectorGetter[] = [getStableAttributeSelector, getIDSelector]

// Selectors to use if they target a single element among an element descendants. Those selectors
// are more brittle than "globally unique" selectors and should be combined with ancestor selectors
// to improve specificity.
const UNIQUE_AMONG_CHILDREN_SELECTOR_GETTERS: SelectorGetter[] = [
  getStableAttributeSelector,
  getClassSelector,
  getTagNameSelector,
]

export function getSelectorFromElement(targetElement: Element, actionNameAttribute: string | undefined) {
  let targetElementSelector = ''
  let element: Element | null = targetElement

  while (element && element.nodeName !== 'HTML') {
    const globallyUniqueSelector = findSelector(
      element,
      GLOBALLY_UNIQUE_SELECTOR_GETTERS,
      isSelectorUniqueGlobally,
      actionNameAttribute,
      targetElementSelector
    )
    if (globallyUniqueSelector) {
      return globallyUniqueSelector
    }

    const uniqueSelectorAmongChildren = findSelector(
      element,
      UNIQUE_AMONG_CHILDREN_SELECTOR_GETTERS,
      isSelectorUniqueAmongSiblings,
      actionNameAttribute,
      targetElementSelector
    )
    targetElementSelector =
      uniqueSelectorAmongChildren ||
      combineSelector(getPositionSelector(element) || getTagNameSelector(element), targetElementSelector)

    element = element.parentElement
  }

  return targetElementSelector
}

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

function getStableAttributeSelector(element: Element, actionNameAttribute: string | undefined): string | undefined {
  if (actionNameAttribute) {
    const selector = getAttributeSelector(actionNameAttribute)
    if (selector) return selector
  }

  for (const attributeName of STABLE_ATTRIBUTES) {
    const selector = getAttributeSelector(attributeName)
    if (selector) return selector
  }

  function getAttributeSelector(attributeName: string) {
    if (element.hasAttribute(attributeName)) {
      return `${element.tagName}[${attributeName}="${cssEscape(element.getAttribute(attributeName)!)}"]`
    }
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
  selectorGetters: SelectorGetter[],
  predicate: (element: Element, selector: string) => boolean,
  actionNameAttribute: string | undefined,
  childSelector?: string
) {
  for (const selectorGetter of selectorGetters) {
    const elementSelector = selectorGetter(element, actionNameAttribute)
    if (!elementSelector) {
      continue
    }
    const fullSelector = combineSelector(elementSelector, childSelector)
    if (predicate(element, fullSelector)) {
      return fullSelector
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
