import { safeTruncate } from '@datadog/browser-core'
import { NodePrivacyLevel, getPrivacySelector } from '../privacyConstants'
import type { RumConfiguration } from '../configuration'
import { isAllowlistMaskEnabled, maskDisallowedTextContent } from './privacy/maskWithAllowlist'
import {
  ActionNameSource,
  DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE,
  ACTION_NAME_PLACEHOLDER,
  ACTION_NAME_TRUNCATION_LENGTH,
} from './actionNameConstants'
import type { ActionName } from './actionNameConstants'

export function getActionNameFromElement(
  element: Element,
  { enablePrivacyForActionName, actionNameAttribute: userProgrammaticAttribute, defaultPrivacyLevel }: RumConfiguration,
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

  const enableAllowlistMask = isAllowlistMaskEnabled(defaultPrivacyLevel, nodePrivacyLevel)

  return (
    getActionNameFromElementForStrategies(
      element,
      userProgrammaticAttribute,
      priorityStrategies,
      enableAllowlistMask,
      enablePrivacyForActionName
    ) ||
    getActionNameFromElementForStrategies(
      element,
      userProgrammaticAttribute,
      fallbackStrategies,
      enableAllowlistMask,
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
  allowlistMaskEnabled: boolean,
  userProgrammaticAttribute: string | undefined,
  privacyEnabledActionName?: boolean
) => ActionName | undefined | null

const priorityStrategies: NameStrategy[] = [
  // associated LABEL text
  (element, allowlistMaskEnabled, userProgrammaticAttribute, privacyEnabledActionName) => {
    if ('labels' in element && element.labels && element.labels.length > 0) {
      return getActionNameFromTextualContent(
        element.labels[0],
        userProgrammaticAttribute,
        allowlistMaskEnabled,
        privacyEnabledActionName
      )
    }
  },
  // INPUT button (and associated) value
  (element, allowlistMaskEnabled) => {
    if (element.nodeName === 'INPUT') {
      const input = element as HTMLInputElement
      const type = input.getAttribute('type')
      if (type === 'button' || type === 'submit' || type === 'reset') {
        return {
          name: allowlistMaskEnabled ? maskDisallowedTextContent(input.value, ACTION_NAME_PLACEHOLDER) : input.value,
          nameSource: ActionNameSource.TEXT_CONTENT,
        }
      }
    }
  },
  // BUTTON, LABEL or button-like element text
  (element, allowlistMaskEnabled, userProgrammaticAttribute, privacyEnabledActionName) => {
    if (element.nodeName === 'BUTTON' || element.nodeName === 'LABEL' || element.getAttribute('role') === 'button') {
      return getActionNameFromTextualContent(
        element,
        userProgrammaticAttribute,
        allowlistMaskEnabled,
        privacyEnabledActionName
      )
    }
  },
  (element, allowlistMaskEnabled) => getActionNameFromStandardAttribute(element, 'aria-label', allowlistMaskEnabled),
  // associated element text designated by the aria-labelledby attribute
  (element, allowlistMaskEnabled, userProgrammaticAttribute, privacyEnabledActionName) => {
    const labelledByAttribute = element.getAttribute('aria-labelledby')
    if (labelledByAttribute) {
      return {
        name: labelledByAttribute
          .split(/\s+/)
          .map((id) => getElementById(element, id))
          .filter((label): label is HTMLElement => Boolean(label))
          .map((element) =>
            getTextualContent(element, userProgrammaticAttribute, allowlistMaskEnabled, privacyEnabledActionName)
          )
          .join(' '),
        nameSource: ActionNameSource.TEXT_CONTENT,
      }
    }
  },
  (element, allowlistMaskEnabled) => getActionNameFromStandardAttribute(element, 'alt', allowlistMaskEnabled),
  (element, allowlistMaskEnabled) => getActionNameFromStandardAttribute(element, 'name', allowlistMaskEnabled),
  (element, allowlistMaskEnabled) => getActionNameFromStandardAttribute(element, 'title', allowlistMaskEnabled),
  (element, allowlistMaskEnabled) => getActionNameFromStandardAttribute(element, 'placeholder', allowlistMaskEnabled),
  // SELECT first OPTION text
  (element, allowlistMaskEnabled, userProgrammaticAttribute, privacyEnabledActionName) => {
    if ('options' in element && element.options.length > 0) {
      return getActionNameFromTextualContent(
        element.options[0],
        userProgrammaticAttribute,
        allowlistMaskEnabled,
        privacyEnabledActionName
      )
    }
  },
]

const fallbackStrategies: NameStrategy[] = [
  (element, allowlistMaskEnabled, userProgrammaticAttribute, privacyEnabledActionName) =>
    getActionNameFromTextualContent(element, userProgrammaticAttribute, allowlistMaskEnabled, privacyEnabledActionName),
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
  allowlistMaskEnabled: boolean,
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
      const actionName = strategy(element, allowlistMaskEnabled, userProgrammaticAttribute, privacyEnabledActionName)
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
  return s.length > ACTION_NAME_TRUNCATION_LENGTH ? `${safeTruncate(s, ACTION_NAME_TRUNCATION_LENGTH)} [...]` : s
}

function getElementById(refElement: Element, id: string) {
  // Use the element ownerDocument here, because tests are executed in an iframe, so
  // document.getElementById won't work.
  return refElement.ownerDocument ? refElement.ownerDocument.getElementById(id) : null
}

function getActionNameFromStandardAttribute(
  element: Element | HTMLElement,
  attribute: string,
  allowlistMaskEnabled: boolean
): ActionName {
  return {
    name: allowlistMaskEnabled
      ? maskDisallowedTextContent(element.getAttribute(attribute) || '', ACTION_NAME_PLACEHOLDER)
      : element.getAttribute(attribute) || '',
    nameSource: ActionNameSource.STANDARD_ATTRIBUTE,
  }
}

function getActionNameFromTextualContent(
  element: Element | HTMLElement,
  userProgrammaticAttribute: string | undefined,
  allowlistMaskEnabled: boolean,
  privacyEnabledActionName?: boolean
): ActionName {
  return {
    name: getTextualContent(element, userProgrammaticAttribute, allowlistMaskEnabled, privacyEnabledActionName) || '',
    nameSource: ActionNameSource.TEXT_CONTENT,
  }
}

function getTextualContent(
  element: Element,
  userProgrammaticAttribute: string | undefined,
  allowlistMaskEnabled: boolean,
  privacyEnabledActionName?: boolean
) {
  if ((element as HTMLElement).isContentEditable) {
    return
  }

  const exclusionSelectors = [`[${DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE}]`]
  if (userProgrammaticAttribute) {
    exclusionSelectors.push(`[${userProgrammaticAttribute}]`)
  }
  if (privacyEnabledActionName) {
    exclusionSelectors.push(
      `${getPrivacySelector(NodePrivacyLevel.HIDDEN)}, ${getPrivacySelector(NodePrivacyLevel.MASK)}`
    )
  }
  const exclusionSelector = exclusionSelectors.join(', ')

  const rejectInvisibleOrMaskedElementsFilter = (node: Node | Element) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return NodeFilter.FILTER_ACCEPT
    }
    if ((node as HTMLElement).closest(exclusionSelector)) {
      return NodeFilter.FILTER_REJECT
    }
    const style = getComputedStyle(node as Element)
    if (style.visibility !== 'visible' || style.display === 'none') {
      return NodeFilter.FILTER_REJECT
    }
    return NodeFilter.FILTER_ACCEPT
  }

  const walker = document.createTreeWalker(
    element,
    // eslint-disable-next-line no-bitwise
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    rejectInvisibleOrMaskedElementsFilter
  )

  let text = ''
  let lastSubstringEndedWithWhiteSpace = false

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeType !== Node.TEXT_NODE) {
      continue
    }

    const nodeText = node.textContent
    if (!nodeText) {
      continue
    }
    const startsWithWhiteSpace = /^\s/.test(nodeText)
    const endsWithWhiteSpace = /\s$/.test(nodeText)

    let trimmedNodeText = nodeText.trim()
    if (trimmedNodeText.length === 0) {
      continue
    }

    if (allowlistMaskEnabled) {
      trimmedNodeText = maskDisallowedTextContent(trimmedNodeText, ACTION_NAME_PLACEHOLDER)
    }
    if (startsWithWhiteSpace || lastSubstringEndedWithWhiteSpace) {
      text += ' '
    }

    text += trimmedNodeText
    lastSubstringEndedWithWhiteSpace = endsWithWhiteSpace
  }

  return text
}
