import { ExperimentalFeature, isExperimentalFeatureEnabled, safeTruncate } from '@datadog/browser-core'
import { getPrivacySelector, NodePrivacyLevel } from '../privacyConstants'
import { getNodePrivacyLevel, shouldMaskNode } from '../privacy'
import type { NodePrivacyLevelCache } from '../privacy'
import type { RumConfiguration } from '../configuration'
import { isElementNode } from '../../browser/htmlDomUtils'
import {
  ActionNameSource,
  DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE,
  ACTION_NAME_PLACEHOLDER,
} from './actionNameConstants'
import type { ActionName } from './actionNameConstants'

export function getActionNameFromElement(
  element: Element,
  rumConfiguration: RumConfiguration,
  nodePrivacyLevel: NodePrivacyLevel = NodePrivacyLevel.ALLOW
): ActionName {
  const { actionNameAttribute: userProgrammaticAttribute } = rumConfiguration

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
    getActionNameFromElementForStrategies(element, priorityStrategies, rumConfiguration) ||
    getActionNameFromElementForStrategies(element, fallbackStrategies, rumConfiguration) || {
      name: '',
      nameSource: ActionNameSource.BLANK,
    }
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
  rumConfiguration: RumConfiguration
) => ActionName | undefined | null

const priorityStrategies: NameStrategy[] = [
  // associated LABEL text
  (element, rumConfiguration) => {
    if ('labels' in element && element.labels && element.labels.length > 0) {
      return getActionNameFromTextualContent(element.labels[0], rumConfiguration)
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
  (element, rumConfiguration) => {
    if (element.nodeName === 'BUTTON' || element.nodeName === 'LABEL' || element.getAttribute('role') === 'button') {
      return getActionNameFromTextualContent(element, rumConfiguration)
    }
  },
  (element) => getActionNameFromStandardAttribute(element, 'aria-label'),
  // associated element text designated by the aria-labelledby attribute
  (element, rumConfiguration) => {
    const labelledByAttribute = element.getAttribute('aria-labelledby')
    if (labelledByAttribute) {
      return {
        name: labelledByAttribute
          .split(/\s+/)
          .map((id) => getElementById(element, id))
          .filter((label): label is HTMLElement => Boolean(label))
          .map((element) => getTextualContent(element, rumConfiguration))
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
  (element, rumConfiguration) => {
    if ('options' in element && element.options.length > 0) {
      return getActionNameFromTextualContent(element.options[0], rumConfiguration)
    }
  },
]

const fallbackStrategies: NameStrategy[] = [
  (element, rumConfiguration) => getActionNameFromTextualContent(element, rumConfiguration),
]

/**
 * Iterates over the target element and its parent, using the strategies list to get an action name.
 * Each strategies are applied on each element, stopping as soon as a non-empty value is returned.
 */
const MAX_PARENTS_TO_CONSIDER = 10
function getActionNameFromElementForStrategies(
  targetElement: Element,
  strategies: NameStrategy[],
  rumConfiguration: RumConfiguration
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
      const actionName = strategy(element, rumConfiguration)
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
  rumConfiguration: RumConfiguration
): ActionName {
  return {
    name: getTextualContent(element, rumConfiguration) || '',
    nameSource: ActionNameSource.TEXT_CONTENT,
  }
}

function getTextualContent(element: Element, rumConfiguration: RumConfiguration) {
  if ((element as HTMLElement).isContentEditable) {
    return
  }

  const {
    enablePrivacyForActionName,
    actionNameAttribute: userProgrammaticAttribute,
    defaultPrivacyLevel,
  } = rumConfiguration

  if (isExperimentalFeatureEnabled(ExperimentalFeature.USE_TREE_WALKER_FOR_ACTION_NAME)) {
    return getTextualContentWithTreeWalker(
      element,
      userProgrammaticAttribute,
      enablePrivacyForActionName,
      defaultPrivacyLevel
    )
  }

  if ('innerText' in element) {
    let text = (element as HTMLElement).innerText

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

    if (enablePrivacyForActionName) {
      // remove the text of elements with privacy override
      removeTextFromElements(
        `${getPrivacySelector(NodePrivacyLevel.HIDDEN)}, ${getPrivacySelector(NodePrivacyLevel.MASK)}`
      )
    }

    return text
  }

  return element.textContent
}

function getTextualContentWithTreeWalker(
  element: Element,
  userProgrammaticAttribute: string | undefined,
  privacyEnabledActionName: boolean,
  defaultPrivacyLevel: NodePrivacyLevel
) {
  const nodePrivacyLevelCache: NodePrivacyLevelCache = new Map()

  const walker = document.createTreeWalker(
    element,
    // eslint-disable-next-line no-bitwise
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    rejectInvisibleOrMaskedElementsFilter
  )

  let text = ''

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (isElementNode(node)) {
      if (
        // Following InnerText rendering spec https://html.spec.whatwg.org/multipage/dom.html#rendered-text-collection-steps
        node.nodeName === 'BR' ||
        node.nodeName === 'P' ||
        ['block', 'flex', 'grid', 'list-item', 'table', 'table-caption'].includes(getComputedStyle(node).display)
      ) {
        text += ' '
      }
      continue // skip element nodes
    }

    text += node.textContent || ''
  }

  return text.replace(/\s+/g, ' ').trim()

  function rejectInvisibleOrMaskedElementsFilter(node: Node) {
    const nodeSelfPrivacyLevel = getNodePrivacyLevel(node, defaultPrivacyLevel, nodePrivacyLevelCache)
    if (privacyEnabledActionName && nodeSelfPrivacyLevel && shouldMaskNode(node, nodeSelfPrivacyLevel)) {
      return NodeFilter.FILTER_REJECT
    }
    if (isElementNode(node)) {
      if (
        node.hasAttribute(DEFAULT_PROGRAMMATIC_ACTION_NAME_ATTRIBUTE) ||
        (userProgrammaticAttribute && node.hasAttribute(userProgrammaticAttribute))
      ) {
        return NodeFilter.FILTER_REJECT
      }
      const style = getComputedStyle(node)
      if (
        style.visibility !== 'visible' ||
        style.display === 'none' ||
        (style.contentVisibility && style.contentVisibility !== 'visible')
        // contentVisibility is not supported in all browsers, so we need to check it
      ) {
        return NodeFilter.FILTER_REJECT
      }
    }

    return NodeFilter.FILTER_ACCEPT
  }
}
