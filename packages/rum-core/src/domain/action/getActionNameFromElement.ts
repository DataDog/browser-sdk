import { safeTruncate, find } from '@datadog/browser-core'
import { NodePrivacyLevel, getPrivacySelector } from '../privacy'
import type { RumConfiguration } from '../configuration'

/**
 * Get the action name from the attribute 'data-dd-action-name' on the element or any of its parent.
 * It can also be retrieved from a user defined attribute.
 */
export const DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE = 'data-dd-action-name'
export const ACTION_NAME_PLACEHOLDER = 'Masked Element'
export function getActionNameFromElement(
  element: Element,
  { enablePrivacyForActionName, actionNameAttribute: userProgrammaticAttribute }: RumConfiguration,
  nodePrivacyLevel?: NodePrivacyLevel
): string {
  // Proceed to get the action name in two steps:
  // * first, get the name programmatically, explicitly defined by the user.
  // * then, use strategies that are known to return good results. Those strategies will be used on
  //   the element and a few parents, but it's likely that they won't succeed at all.
  // * if no name is found this way, use strategies returning less accurate names as a fallback.
  //   Those are much likely to succeed.
  const defaultActionName =
    getActionNameFromElementProgrammatically(element, DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE) ||
    (userProgrammaticAttribute && getActionNameFromElementProgrammatically(element, userProgrammaticAttribute))

  if (nodePrivacyLevel === NodePrivacyLevel.MASK) {
    return defaultActionName || ACTION_NAME_PLACEHOLDER
  }

  return (
    defaultActionName ||
    getActionNameFromElementForStrategies(
      element,
      userProgrammaticAttribute,
      priorityStrategies,
      enablePrivacyForActionName
    ) ||
    getActionNameFromElementForStrategies(
      element,
      userProgrammaticAttribute,
      fallbackStrategies,
      enablePrivacyForActionName
    ) ||
    ''
  )
}

function getActionNameFromElementProgrammatically(targetElement: Element, programmaticAttribute: string) {
  // We don't use getActionNameFromElementForStrategies here, because we want to consider all parents,
  // without limit. It is up to the user to declare a relevant naming strategy.
  const elementWithAttribute = targetElement.closest(`[${programmaticAttribute}]`)

  if (!elementWithAttribute) {
    return
  }
  const name = elementWithAttribute.getAttribute(programmaticAttribute)!
  return truncate(normalizeWhitespace(name.trim()))
}

type NameStrategy = (
  element: Element | HTMLElement | HTMLInputElement | HTMLSelectElement,
  userProgrammaticAttribute: string | undefined,
  privacyEnabledActionName?: boolean
) => string | undefined | null

const priorityStrategies: NameStrategy[] = [
  // associated LABEL text
  (element, userProgrammaticAttribute, privacy) => {
    // Edge < 18 does not support element.labels, so we fallback to a CSS selector based on the element id
    // instead
    if (supportsLabelProperty()) {
      if ('labels' in element && element.labels && element.labels.length > 0) {
        return getTextualContent(element.labels[0], userProgrammaticAttribute)
      }
    } else if (element.id) {
      const label =
        element.ownerDocument &&
        find(element.ownerDocument.querySelectorAll('label'), (label) => label.htmlFor === element.id)
      return label && getTextualContent(label, userProgrammaticAttribute, privacy)
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
  (element, userProgrammaticAttribute, privacyEnabledActionName) => {
    if (element.nodeName === 'BUTTON' || element.nodeName === 'LABEL' || element.getAttribute('role') === 'button') {
      return getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName)
    }
  },
  (element) => element.getAttribute('aria-label'),
  // associated element text designated by the aria-labelledby attribute
  (element, userProgrammaticAttribute, privacyEnabledActionName) => {
    const labelledByAttribute = element.getAttribute('aria-labelledby')
    if (labelledByAttribute) {
      return labelledByAttribute
        .split(/\s+/)
        .map((id) => getElementById(element, id))
        .filter((label): label is HTMLElement => Boolean(label))
        .map((element) => getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName))
        .join(' ')
    }
  },
  (element) => element.getAttribute('alt'),
  (element) => element.getAttribute('name'),
  (element) => element.getAttribute('title'),
  (element) => element.getAttribute('placeholder'),
  // SELECT first OPTION text
  (element, userProgrammaticAttribute) => {
    if ('options' in element && element.options.length > 0) {
      return getTextualContent(element.options[0], userProgrammaticAttribute)
    }
  },
]

const fallbackStrategies: NameStrategy[] = [
  (element, userProgrammaticAttribute, privacyEnabledActionName) =>
    getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName),
]

/**
 * Iterates over the target element and its parent, using the strategies list to get an action name.
 * Each strategies are applied on each element, stopping as soon as a non-empty value is returned.
 */
const MAX_PARENTS_TO_CONSIDER = 10
function getActionNameFromElementForStrategies(
  targetElement: Element,
  userProgrammaticAttribute: string | undefined,
  strategies: NameStrategy[],
  privacyEnabledActionName?: boolean
) {
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
      const name = strategy(element, userProgrammaticAttribute, privacyEnabledActionName)
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

function getTextualContent(
  element: Element | HTMLElement,
  userProgrammaticAttribute: string | undefined,
  privacyEnabledActionName?: boolean
) {
  if ((element as HTMLElement).isContentEditable) {
    return
  }

  if ('innerText' in element) {
    let text = element.innerText

    const removeTextFromElements = (query: string) => {
      const list = element.querySelectorAll<Element | HTMLElement>(query)
      for (let index = 0; index < list.length; index += 1) {
        const element = list[index]
        if ('innerText' in element) {
          const textToReplace = element.innerText
          if (textToReplace && textToReplace.trim().length > 0) {
            text = text.replace(textToReplace, '')
          }
        }
      }
    }

    // remove the text of elements with programmatic attribute value
    removeTextFromElements(`[${DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE}]`)

    if (userProgrammaticAttribute) {
      removeTextFromElements(`[${userProgrammaticAttribute}]`)
    }

    if (privacyEnabledActionName) {
      // remove the text of elements with privacy override
      removeTextFromElements(
        `${getPrivacySelector(NodePrivacyLevel.HIDDEN)}, ${getPrivacySelector(NodePrivacyLevel.MASK)}`
      )
    }

    return text
  }

  return element.textContent
}

/**
 * Returns true if the browser supports the element.labels property.  This should be the case
 * everywhere except on Edge <18
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
