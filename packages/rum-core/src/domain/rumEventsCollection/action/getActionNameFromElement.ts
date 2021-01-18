import { safeTruncate } from '@datadog/browser-core'

export function getActionNameFromElement(element: Element): string {
  // Proceed to get the action name in two steps:
  // * first, get the name programmatically, explicitly defined by the user.
  // * then, use strategies that are known to return good results. Those strategies will be used on
  //   the element and a few parents, but it's likely that they won't succeed at all.
  // * if no name is found this way, use strategies returning less accurate names as a fallback.
  //   Those are much likely to succeed.
  return (
    getActionNameFromElementProgrammatically(element) ||
    getActionNameFromElementForStrategies(element, priorityStrategies) ||
    getActionNameFromElementForStrategies(element, fallbackStrategies) ||
    ''
  )
}

/**
 * Get the action name from the attribute 'data-dd-action-name' on the element or any of its parent.
 */
const PROGRAMMATIC_ATTRIBUTE = 'data-dd-action-name'
function getActionNameFromElementProgrammatically(targetElement: Element) {
  let elementWithAttribute
  // We don't use getActionNameFromElementForStrategies here, because we want to consider all parents,
  // without limit. It is up to the user to declare a relevant naming strategy.
  // If available, use element.closest() to match get the attribute from the element or any of its
  // parent.  Else fallback to a more traditional implementation.
  if (supportsElementClosest()) {
    elementWithAttribute = targetElement.closest(`[${PROGRAMMATIC_ATTRIBUTE}]`)
  } else {
    let element: Element | null = targetElement
    while (element) {
      if (element.hasAttribute(PROGRAMMATIC_ATTRIBUTE)) {
        elementWithAttribute = element
        break
      }
      element = element.parentElement
    }
  }

  if (!elementWithAttribute) {
    return
  }
  const name = elementWithAttribute.getAttribute(PROGRAMMATIC_ATTRIBUTE)!
  return truncate(normalizeWhitespace(name.trim()))
}

type NameStrategy = (element: Element | HTMLElement | HTMLInputElement | HTMLSelectElement) => string | undefined | null

const priorityStrategies: NameStrategy[] = [
  // associated LABEL text
  (element) => {
    // IE does not support element.labels, so we fallback to a CSS selector based on the element id
    // instead
    if (supportsLabelProperty()) {
      if ('labels' in element && element.labels && element.labels.length > 0) {
        return getTextualContent(element.labels[0])
      }
    } else if (element.id) {
      const label =
        element.ownerDocument && element.ownerDocument.querySelector(`label[for="${element.id.replace('"', '\\"')}"]`)
      return label && getTextualContent(label)
    }
  },
  // INPUT button (and associated) value
  (element) => {
    if (element.nodeName === 'INPUT') {
      const input = element as HTMLInputElement
      const type = input.getAttribute('type')
      if (type === 'button' || type === 'submit' || type === 'reset') {
        return input.value
      }
    }
  },
  // BUTTON, LABEL or button-like element text
  (element) => {
    if (element.nodeName === 'BUTTON' || element.nodeName === 'LABEL' || element.getAttribute('role') === 'button') {
      return getTextualContent(element)
    }
  },
  (element) => element.getAttribute('aria-label'),
  // associated element text designated by the aria-labelledby attribute
  (element) => {
    const labelledByAttribute = element.getAttribute('aria-labelledby')
    if (labelledByAttribute) {
      return labelledByAttribute
        .split(/\s+/)
        .map((id) => getElementById(element, id))
        .filter((label): label is HTMLElement => Boolean(label))
        .map(getTextualContent)
        .join(' ')
    }
  },
  (element) => element.getAttribute('alt'),
  (element) => element.getAttribute('name'),
  (element) => element.getAttribute('title'),
  (element) => element.getAttribute('placeholder'),
  // SELECT first OPTION text
  (element) => {
    if ('options' in element && element.options.length > 0) {
      return getTextualContent(element.options[0])
    }
  },
]

const fallbackStrategies: NameStrategy[] = [(element) => getTextualContent(element)]

/**
 * Iterates over the target element and its parent, using the strategies list to get an action name.
 * Each strategies are applied on each element, stopping as soon as a non-empty value is returned.
 */
const MAX_PARENTS_TO_CONSIDER = 10
function getActionNameFromElementForStrategies(targetElement: Element, strategies: NameStrategy[]) {
  let element: Element | null = targetElement
  let recursionCounter = 0
  while (
    recursionCounter <= MAX_PARENTS_TO_CONSIDER &&
    element &&
    element.nodeName !== 'BODY' &&
    element.nodeName !== 'HTML' &&
    element.nodeName !== 'HEAD'
  ) {
    for (const strategy of strategies) {
      const name = strategy(element)
      if (typeof name === 'string') {
        const trimmedName = name.trim()
        if (trimmedName) {
          return truncate(normalizeWhitespace(trimmedName))
        }
      }
    }
    // Consider a FORM as a contextual limit to get the action name.  This is experimental and may
    // be reconsidered in the future.
    if (element.nodeName === 'FORM') {
      break
    }
    element = element.parentElement
    recursionCounter += 1
  }
}

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, ' ')
}

function truncate(s: string) {
  return s.length > 100 ? `${safeTruncate(s, 100)} [...]` : s
}

function getElementById(refElement: Element, id: string) {
  // Use the element ownerDocument here, because tests are executed in an iframe, so
  // document.getElementById won't work.
  return refElement.ownerDocument ? refElement.ownerDocument.getElementById(id) : null
}

function getTextualContent(element: Element | HTMLElement) {
  if ((element as HTMLElement).isContentEditable) {
    return
  }

  if ('innerText' in element) {
    let text = element.innerText
    if (!supportsInnerTextScriptAndStyleRemoval()) {
      // remove the inner text of SCRIPT and STYLES from the result. This is a bit dirty, but should
      // be relatively fast and work in most cases.
      const elementsTextToRemove: NodeListOf<HTMLElement> = element.querySelectorAll('script, style')
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < elementsTextToRemove.length; i += 1) {
        const innerText = elementsTextToRemove[i].innerText
        if (innerText.trim().length > 0) {
          text = text.replace(innerText, '')
        }
      }
    }
    return text
  }

  return element.textContent
}

/**
 * Returns true if element.innerText excludes the text from inline SCRIPT and STYLE element.  This
 * should be the case everywhere except on some version of Internet Explorer.
 * See http://perfectionkills.com/the-poor-misunderstood-innerText/#diff-with-textContent
 */
let supportsInnerTextScriptAndStyleRemovalResult: boolean | undefined
function supportsInnerTextScriptAndStyleRemoval() {
  if (supportsInnerTextScriptAndStyleRemovalResult === undefined) {
    const style = document.createElement('style')
    style.textContent = '*'
    const div = document.createElement('div')
    div.appendChild(style)
    document.body.appendChild(div)
    supportsInnerTextScriptAndStyleRemovalResult = div.innerText === ''
    document.body.removeChild(div)
  }
  return supportsInnerTextScriptAndStyleRemovalResult
}

/**
 * Returns true if the browser supports the element.labels property.  This should be the case
 * everywhere except on Internet Explorer.
 * Note: The result is computed lazily, because we don't want any DOM access when the SDK is
 * evaluated.
 */
let supportsLabelPropertyResult: boolean | undefined
function supportsLabelProperty() {
  if (supportsLabelPropertyResult === undefined) {
    supportsLabelPropertyResult = 'labels' in HTMLInputElement.prototype
  }
  return supportsLabelPropertyResult
}

/**
 * Returns true if the browser supports the element.closest method.  This should be the case
 * everywhere except on Internet Explorer.
 * Note: The result is computed lazily, because we don't want any DOM access when the SDK is
 * evaluated.
 */
let supportsElementClosestResult: boolean | undefined
function supportsElementClosest() {
  if (supportsElementClosestResult === undefined) {
    supportsElementClosestResult = 'closest' in HTMLElement.prototype
  }
  return supportsElementClosestResult
}
