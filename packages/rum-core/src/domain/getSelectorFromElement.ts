import { cssEscape, elementMatches, getClassList, getParentElement } from '../browser/polyfills'
import { DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE } from './action/getActionNameFromElement'

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

export function getSelectorFromElement(
  targetElement: Element,
  actionNameAttribute: string | undefined
): string | undefined {
  if (!isConnected(targetElement)) {
    // We cannot compute a selector for a detached element, as we don't have access to all of its
    // parents, and we cannot determine if it's unique in the document.
    return
  }
  let targetElementSelector: string | undefined
  let currentElement: Element | null = targetElement

  while (currentElement && currentElement.nodeName !== 'HTML') {
    const globallyUniqueSelector = findSelector(
      currentElement,
      GLOBALLY_UNIQUE_SELECTOR_GETTERS,
      isSelectorUniqueGlobally,
      actionNameAttribute,
      targetElementSelector
    )
    if (globallyUniqueSelector) {
      return globallyUniqueSelector
    }

    const uniqueSelectorAmongChildren = findSelector(
      currentElement,
      UNIQUE_AMONG_CHILDREN_SELECTOR_GETTERS,
      isSelectorUniqueAmongSiblings,
      actionNameAttribute,
      targetElementSelector
    )
    targetElementSelector =
      uniqueSelectorAmongChildren || combineSelector(getPositionSelector(currentElement), targetElementSelector)

    currentElement = getParentElement(currentElement)
  }

  return targetElementSelector
}

function isGeneratedValue(value: string) {
  // To compute the "URL path group", the backend replaces every URL path parts as a question mark
  // if it thinks the part is an identifier. The condition it uses is to checks whether a digit is
  // present.
  //
  // Here, we use the same strategy: if the value contains a digit, we consider it generated. This
  // strategy might be a bit naive and fail in some cases, but there are many fallbacks to generate
  // CSS selectors so it should be fine most of the time.
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
  const classList = getClassList(element)
  for (let i = 0; i < classList.length; i += 1) {
    const className = classList[i]
    if (isGeneratedValue(className)) {
      continue
    }

    return `${cssEscape(element.tagName)}.${cssEscape(className)}`
  }
}

function getTagNameSelector(element: Element): string {
  return cssEscape(element.tagName)
}

function getStableAttributeSelector(element: Element, actionNameAttribute: string | undefined): string | undefined {
  if (actionNameAttribute) {
    const selector = getAttributeSelector(actionNameAttribute)
    if (selector) {
      return selector
    }
  }

  for (const attributeName of STABLE_ATTRIBUTES) {
    const selector = getAttributeSelector(attributeName)
    if (selector) {
      return selector
    }
  }

  function getAttributeSelector(attributeName: string) {
    if (element.hasAttribute(attributeName)) {
      return `${cssEscape(element.tagName)}[${attributeName}="${cssEscape(element.getAttribute(attributeName)!)}"]`
    }
  }
}

function getPositionSelector(element: Element): string {
  let sibling = getParentElement(element)!.firstElementChild
  let elementIndex = 1

  while (sibling && sibling !== element) {
    if (sibling.tagName === element.tagName) {
      elementIndex += 1
    }
    sibling = sibling.nextElementSibling
  }

  return `${cssEscape(element.tagName)}:nth-of-type(${elementIndex})`
}

function findSelector(
  element: Element,
  selectorGetters: SelectorGetter[],
  predicate: (element: Element, elementSelector: string, childSelector: string | undefined) => boolean,
  actionNameAttribute: string | undefined,
  childSelector: string | undefined
) {
  for (const selectorGetter of selectorGetters) {
    const elementSelector = selectorGetter(element, actionNameAttribute)
    if (!elementSelector) {
      continue
    }
    if (predicate(element, elementSelector, childSelector)) {
      return combineSelector(elementSelector, childSelector)
    }
  }
}

/**
 * Check whether the selector is unique among the whole document.
 */
function isSelectorUniqueGlobally(
  element: Element,
  elementSelector: string,
  childSelector: string | undefined
): boolean {
  return element.ownerDocument.querySelectorAll(combineSelector(elementSelector, childSelector)).length === 1
}

/**
 * Check whether the selector is unique among the element siblings. In other words, it returns true
 * if "ELEMENT_PARENT > CHILD_SELECTOR" returns a single element.
 *
 * @param {Element} currentElement - the element being considered while iterating over the target
 * element ancestors.
 *
 * @param {string} currentElementSelector - a selector that matches the current element. That
 * selector is not a composed selector (i.e. it might be a single tag name, class name...).
 *
 * @param {string|undefined} childSelector - child selector is a selector that targets a descendant
 * of the current element. When undefined, the current element is the target element.
 *
 * # Scope selector usage
 *
 * When composed together, the final selector will be joined with `>` operators to make sure we
 * target direct descendants at each level. In this function, we'll use `querySelector` to check if
 * a selector matches descendants of the current element. But by default, the query selector match
 * elements at any level. Example:
 *
 * ```html
 * <main>
 *   <div>
 *     <span></span>
 *   </div>
 *   <marquee>
 *     <div>
 *       <span></span>
 *     </div>
 *   </marquee>
 * </main>
 * ```
 *
 * `sibling.querySelector('DIV > SPAN')` will match both span elements, so we would consider the
 * selector to be not unique, even if it is unique when we'll compose it with the parent with a `>`
 * operator (`MAIN > DIV > SPAN`).
 *
 * To avoid this, we can use the `:scope` selector to make sure the selector starts from the current
 * sibling (i.e. `sibling.querySelector('DIV:scope > SPAN')` will only match the first span).
 *
 * The result will be less accurate on browsers that don't support :scope (i. e. IE): it will check
 * for any element matching the selector contained in the parent (in other words,
 * "ELEMENT_PARENT CHILD_SELECTOR" returns a single element), regardless of whether the selector is
 * a direct descendant of the element parent. This should not impact results too much: if it
 * inaccurately returns false, we'll just fall back to another strategy.
 *
 * [1]: https://developer.mozilla.org/fr/docs/Web/CSS/:scope
 *
 * # Performance considerations
 *
 * We compute selectors in performance-critical operations (ex: during a click), so we need to make
 * sure the function is as fast as possible. We observed that naively using `querySelectorAll` to
 * check if the selector matches more than 1 element is quite expensive, so we want to avoid it.
 *
 * Because we are iterating the DOM upward and we use that function at every level, we know the
 * child selector is already unique among the current element children, so we don't need to check
 * for the current element subtree.
 *
 * Instead, we can focus on the current element siblings. If we find a single element matching the
 * selector within a sibling, we know that it's not unique. This allows us to use `querySelector`
 * (or `matches`, when the current element is the target element) instead of `querySelectorAll`.
 */
export function isSelectorUniqueAmongSiblings(
  currentElement: Element,
  currentElementSelector: string,
  childSelector: string | undefined
): boolean {
  let isSiblingMatching: (sibling: Element) => boolean

  if (childSelector === undefined) {
    // If the child selector is undefined (meaning `currentElement` is the target element, not one
    // of its ancestor), we need to use `matches` to check if the sibling is matching the selector,
    // as `querySelector` only returns a descendant of the element.
    isSiblingMatching = (sibling) => elementMatches(sibling, currentElementSelector)
  } else {
    const scopedSelector = supportScopeSelector()
      ? combineSelector(`${currentElementSelector}:scope`, childSelector)
      : combineSelector(currentElementSelector, childSelector)
    isSiblingMatching = (sibling) => sibling.querySelector(scopedSelector) !== null
  }

  const parent = getParentElement(currentElement)!
  let sibling = parent.firstElementChild
  while (sibling) {
    if (sibling !== currentElement && isSiblingMatching(sibling)) {
      return false
    }
    sibling = sibling.nextElementSibling
  }

  return true
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

/**
 * Polyfill-utility for the `isConnected` property not supported in IE11
 */
function isConnected(element: Element): boolean {
  if (
    'isConnected' in
    // cast is to make sure `element` is not inferred as `never` after the check
    (element as { isConnected?: boolean })
  ) {
    return element.isConnected
  }

  return element.ownerDocument.documentElement.contains(element)
}
