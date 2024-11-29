import { safeTruncate } from '@datadog/browser-core'
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
) => ActionName | undefined | null

const priorityStrategies: NameStrategy[] = [
  // associated LABEL text
  (element, userProgrammaticAttribute) => {
    if ('labels' in element && element.labels && element.labels.length > 0) {
      return getActionNameFromTextualContent(element.labels[0], userProgrammaticAttribute)
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
  (element) => getActionNameFromStandardAttribute(element, 'aria-label'),
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
  (element) => getActionNameFromStandardAttribute(element, 'alt'),
  (element) => getActionNameFromStandardAttribute(element, 'name'),
  (element) => getActionNameFromStandardAttribute(element, 'title'),
  (element) => getActionNameFromStandardAttribute(element, 'placeholder'),
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
        const { name, nameSource } = actionName
        const trimmedName = name && name.trim()
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

function getActionNameFromStandardAttribute(element: Element | HTMLElement, attribute: string): ActionName {
  return {
    name: element.getAttribute(attribute) || '',
    nameSource: ActionNameSource.STANDARD_ATTRIBUTE,
  }
}

function getActionNameFromTextualContent(
  element: Element | HTMLElement,
  userProgrammaticAttribute: string | undefined,
  privacyEnabledActionName?: boolean
): ActionName {
  return {
    name: getTextualContent(element, userProgrammaticAttribute, privacyEnabledActionName) || '',
    nameSource: ActionNameSource.TEXT_CONTENT,
  }
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
