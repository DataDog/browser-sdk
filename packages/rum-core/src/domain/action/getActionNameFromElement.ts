import { safeTruncate, isIE, find } from '@datadog/browser-core'
import { getParentElement } from '../../browser/polyfills'
import { NodePrivacyLevel, getPrivacySelector } from '../privacy'
import type { RumConfiguration } from '../configuration'

/**
 * Get the action name from the attribute 'data-dd-action-name' on the element or any of its parent.
 * It can also be retrieved from a user defined attribute.
 */
export const DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE = 'data-dd-action-name'
export const ACTION_NAME_PLACEHOLDER = 'Masked Element'
export const enum ActionNameSource {
  CUSTOM_ATTRIBUTE = 'custom_attribute',
  MASK_PLACEHOLDER = 'mask_placeholder',
  TEXT_CONTENT = 'text_content',
  STANDARD_ATTRIBUTE = 'standard_attribute',
  BLANK = 'blank',
}
type ActionName = {
  name: string
  nameSource: ActionNameSource
}

export function getActionNameFromElement(
  element: Element,
  { enablePrivacyForActionName, actionNameAttribute: userProgrammaticAttribute }: RumConfiguration,
  nodePrivacyLevel?: NodePrivacyLevel
): ActionName {
  // Proceed to get the action name in two steps:
  // * first, get the name programmatically, explicitly defined by the user.
  // * then, if privacy is set to mask, return a placeholder for the undefined.
  // * if privacy is not set to mask, use strategies that are known to return good results.
  //   Those strategies will be used on the element and a few parents, but it's likely that they won't succeed at all.
  // * if no name is found this way, use strategies returning less accurate names as a fallback.
  //   Those are much likely to succeed.
  const defaultActionName =
    getActionNameFromElementProgrammatically(element, DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE) ||
    (userProgrammaticAttribute && getActionNameFromElementProgrammatically(element, userProgrammaticAttribute))

  if (defaultActionName) {
    return { name: defaultActionName, nameSource: ActionNameSource.CUSTOM_ATTRIBUTE }
  } else if (nodePrivacyLevel === NodePrivacyLevel.MASK) {
    return { name: ACTION_NAME_PLACEHOLDER, nameSource: ActionNameSource.MASK_PLACEHOLDER }
  }

  return (
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
    ) || { name: '', nameSource: ActionNameSource.BLANK }
  )
}

function getActionNameFromElementProgrammatically(targetElement: Element, programmaticAttribute: string) {
  let elementWithAttribute
  // We don't use getActionNameFromElementForStrategies here, because we want to consider all parents,
  // without limit. It is up to the user to declare a relevant naming strategy.
  // If available, use element.closest() to match get the attribute from the element or any of its
  // parent.  Else fallback to a more traditional implementation.
  if (supportsElementClosest()) {
    elementWithAttribute = targetElement.closest(`[${programmaticAttribute}]`)
  } else {
    let element: Element | null = targetElement
    while (element) {
      if (element.hasAttribute(programmaticAttribute)) {
        elementWithAttribute = element
        break
      }
      element = getParentElement(element)
    }
  }

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
) => ActionName | string | undefined | null

const priorityStrategies: NameStrategy[] = [
  // associated LABEL text
  (element, userProgrammaticAttribute, privacy) => {
    // IE does not support element.labels, so we fallback to a CSS selector based on the element id
    // instead
    if (supportsLabelProperty()) {
      if ('labels' in element && element.labels && element.labels.length > 0) {
        return getActionNameFromTextualContent(element.labels[0], userProgrammaticAttribute)
      }
    } else if (element.id) {
      const label =
        element.ownerDocument &&
        find(element.ownerDocument.querySelectorAll('label'), (label) => label.htmlFor === element.id)
      return label && getActionNameFromTextualContent(label, userProgrammaticAttribute, privacy)
    }
  },
  // INPUT button (and associated) value
  (element) => {
    if (element.nodeName === 'INPUT') {
      const input = element as HTMLInputElement
      const type = input.getAttribute('type')
      if (type === 'button' || type === 'submit' || type === 'reset') {
        return { name: input.value, nameSource: ActionNameSource.TEXT_CONTENT }
      }
    }
  },
  // BUTTON, LABEL or button-like element text
  (element, userProgrammaticAttribute, privacyEnabledActionName) => {
    if (element.nodeName === 'BUTTON' || element.nodeName === 'LABEL' || element.getAttribute('role') === 'button') {
      return getActionNameFromTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName)
    }
  },
  (element) => element.getAttribute('aria-label'),
  // associated element text designated by the aria-labelledby attribute
  (element, userProgrammaticAttribute, privacyEnabledActionName) => {
    const labelledByAttribute = element.getAttribute('aria-labelledby')
    if (labelledByAttribute) {
      return {
        name: labelledByAttribute
          .split(/\s+/)
          .map((id) => getElementById(element, id))
          .filter((label): label is HTMLElement => Boolean(label))
          .map((element) => getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName))
          .join(' '),
        nameSource: ActionNameSource.TEXT_CONTENT,
      }
    }
  },
  (element) => element.getAttribute('alt'),
  (element) => element.getAttribute('name'),
  (element) => element.getAttribute('title'),
  (element) => element.getAttribute('placeholder'),
  // SELECT first OPTION text
  (element, userProgrammaticAttribute) => {
    if ('options' in element && element.options.length > 0) {
      return getActionNameFromTextualContent(element.options[0], userProgrammaticAttribute)
    }
  },
]

const fallbackStrategies: NameStrategy[] = [
  (element, userProgrammaticAttribute, privacyEnabledActionName) =>
    getActionNameFromTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName),
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
      const actionName = strategy(element, userProgrammaticAttribute, privacyEnabledActionName)
      if (actionName) {
        const { name, nameSource } =
          typeof actionName === 'string'
            ? { name: actionName, nameSource: ActionNameSource.STANDARD_ATTRIBUTE }
            : actionName
        const trimmedName = name.trim()
        if (trimmedName) {
          return { name: truncate(normalizeWhitespace(trimmedName)), nameSource }
        }
      }
    }
    // Consider a FORM as a contextual limit to get the action name.  This is experimental and may
    // be reconsidered in the future.
    if (element.nodeName === 'FORM') {
      break
    }
    element = getParentElement(element)
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

function getActionNameFromTextualContent(
  element: Element | HTMLElement,
  userProgrammaticAttribute: string | undefined,
  privacyEnabledActionName?: boolean
): ActionName | undefined {
  const name = getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName)
  return name ? { name, nameSource: ActionNameSource.TEXT_CONTENT } : undefined
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

    if (!supportsInnerTextScriptAndStyleRemoval()) {
      // remove the inner text of SCRIPT and STYLES from the result. This is a bit dirty, but should
      // be relatively fast and work in most cases.
      removeTextFromElements('script, style')
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
 * Returns true if element.innerText excludes the text from inline SCRIPT and STYLE element. This
 * should be the case everywhere except on Internet Explorer 10 and 11 (see [1])
 *
 * The innerText property relies on what is actually rendered to compute its output, so to check if
 * it actually excludes SCRIPT and STYLE content, a solution would be to create a style element, set
 * its content to '*', inject it in the document body, and check if the style element innerText
 * property returns '*'. Using a new `document` instance won't work as it is not rendered.
 *
 * This solution requires specific CSP rules (see [2]) to be set by the customer. We want to avoid
 * this, so instead we rely on browser detection. In case of false negative, the impact should be
 * low, since we rely on this result to remove the SCRIPT and STYLE innerText (which will be empty)
 * from a parent element innerText.
 *
 * [1]: https://web.archive.org/web/20210602165716/http://perfectionkills.com/the-poor-misunderstood-innerText/#diff-with-textContent
 * [2]: https://github.com/DataDog/browser-sdk/issues/1084
 */
function supportsInnerTextScriptAndStyleRemoval() {
  return !isIE()
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
