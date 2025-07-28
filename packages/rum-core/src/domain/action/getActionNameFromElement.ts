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
import { getNodePrivacyLevel, getTextContent } from '../privacy'

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

/**
 * TODO: we should fix this logic in next major version
 * In certain cases, the masked strings will be removed even from places where they shouldn't be masked,
 * which leaks information about the private information that was masked. Example:
 * <fieldset>
 * <legend>Gender (Female, Male, Non-binary):</legend>
 * <div>
 * Currently selected gender: <span data-dd-privacy="mask">Female</span>
 * </div>
 * <button type="button">Update gender...</button>
 * </fieldset>
 * Here the customer has marked all of the gender <input>s as hidden, but if they click on the <fieldset> itself,
 * the gender the user chose will be leaked, because it will be removed from the text of the <legend> element as well.
 *
 * We should use node traversal to append the wanted node text directly
 */
function getTextualContent(
  element: Element | HTMLElement,
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

  const allowedTexts: string[] = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let node: Node | null
  let length = 0

  while ((node = walker.nextNode())) {
    if (length > ACTION_NAME_TRUNCATION_LENGTH) {
      break
    }

    if (node.parentElement && node.parentElement.closest(exclusionSelector)) {
      continue
    }

    const nodeText = getTextContent(node, false, NodePrivacyLevel.ALLOW)
    if(!nodeText) {
      continue
    }

    if (allowlistMaskEnabled) {
      allowedTexts.push(maskDisallowedTextContent(nodeText, ACTION_NAME_PLACEHOLDER))
    } else {
      allowedTexts.push(nodeText)
    }
    length += nodeText.length
  }

  return allowedTexts.join(' ')
}
