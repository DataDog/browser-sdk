import { isElementNode, getParentNode, isTextNode } from '../browser/htmlDomUtils'
import {
  NodePrivacyLevel,
  FORM_PRIVATE_TAG_NAMES,
  CENSORED_STRING_MARK,
  getPrivacySelector,
  TEXT_MASKING_CHAR,
  PRIVACY_ATTR_NAME,
} from './privacyConstants'
import { STABLE_ATTRIBUTES } from './getSelectorFromElement'
import type { RumConfiguration } from './configuration'

export type NodePrivacyLevelCache = Map<Node, NodePrivacyLevel>

/**
 * Get node privacy level by iterating over its ancestors. When the direct parent privacy level is
 * know, it is best to use something like:
 *
 * derivePrivacyLevelGivenParent(getNodeSelfPrivacyLevel(node), parentNodePrivacyLevel)
 */
export function getNodePrivacyLevel(
  node: Node,
  defaultPrivacyLevel: NodePrivacyLevel,
  cache?: NodePrivacyLevelCache
): NodePrivacyLevel {
  if (cache && cache.has(node)) {
    return cache.get(node)!
  }
  const parentNode = getParentNode(node)
  const parentNodePrivacyLevel = parentNode
    ? getNodePrivacyLevel(parentNode, defaultPrivacyLevel, cache)
    : defaultPrivacyLevel
  const selfNodePrivacyLevel = getNodeSelfPrivacyLevel(node)
  const nodePrivacyLevel = reducePrivacyLevel(selfNodePrivacyLevel, parentNodePrivacyLevel)
  if (cache) {
    cache.set(node, nodePrivacyLevel)
  }
  return nodePrivacyLevel
}

/**
 * Reduces the next privacy level based on self + parent privacy levels
 */
export function reducePrivacyLevel(
  childPrivacyLevel: NodePrivacyLevel | undefined,
  parentNodePrivacyLevel: NodePrivacyLevel
): NodePrivacyLevel {
  switch (parentNodePrivacyLevel) {
    // These values cannot be overridden
    case NodePrivacyLevel.HIDDEN:
    case NodePrivacyLevel.IGNORE:
      return parentNodePrivacyLevel
  }
  switch (childPrivacyLevel) {
    case NodePrivacyLevel.ALLOW:
    case NodePrivacyLevel.MASK:
    case NodePrivacyLevel.MASK_USER_INPUT:
    case NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED:
    case NodePrivacyLevel.HIDDEN:
    case NodePrivacyLevel.IGNORE:
      return childPrivacyLevel
    default:
      return parentNodePrivacyLevel
  }
}

/**
 * Determines the node's own privacy level without checking for ancestors.
 */
export function getNodeSelfPrivacyLevel(node: Node): NodePrivacyLevel | undefined {
  // Only Element types can have a privacy level set
  if (!isElementNode(node)) {
    return
  }

  // Overrules for replay purpose
  if (node.tagName === 'BASE') {
    return NodePrivacyLevel.ALLOW
  }

  // Overrules to enforce end-user protection
  if (node.tagName === 'INPUT') {
    const inputElement = node as HTMLInputElement
    if (inputElement.type === 'password' || inputElement.type === 'email' || inputElement.type === 'tel') {
      return NodePrivacyLevel.MASK
    }
    if (inputElement.type === 'hidden') {
      return NodePrivacyLevel.MASK
    }
    const autocomplete = inputElement.getAttribute('autocomplete')
    // Handle input[autocomplete=cc-number/cc-csc/cc-exp/cc-exp-month/cc-exp-year/new-password/current-password]
    if (autocomplete && (autocomplete.startsWith('cc-') || autocomplete.endsWith('-password'))) {
      return NodePrivacyLevel.MASK
    }
  }

  // Check HTML privacy attributes and classes
  if (node.matches(getPrivacySelector(NodePrivacyLevel.HIDDEN))) {
    return NodePrivacyLevel.HIDDEN
  }

  if (node.matches(getPrivacySelector(NodePrivacyLevel.MASK))) {
    return NodePrivacyLevel.MASK
  }

  if (node.matches(getPrivacySelector(NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED))) {
    return NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED
  }

  if (node.matches(getPrivacySelector(NodePrivacyLevel.MASK_USER_INPUT))) {
    return NodePrivacyLevel.MASK_USER_INPUT
  }

  if (node.matches(getPrivacySelector(NodePrivacyLevel.ALLOW))) {
    return NodePrivacyLevel.ALLOW
  }

  if (shouldIgnoreElement(node)) {
    return NodePrivacyLevel.IGNORE
  }
}

/**
 * Helper aiming to unify `mask` and `mask-user-input` privacy levels:
 *
 * In the `mask` case, it is trivial: we should mask the element.
 *
 * In the `mask-user-input` case, we should mask the element only if it is a "form" element or the
 * direct parent is a form element for text nodes).
 *
 * Other `shouldMaskNode` cases are edge cases that should not matter too much (ex: should we mask a
 * node if it is ignored or hidden? it doesn't matter since it won't be serialized).
 */
export function shouldMaskNode(node: Node, privacyLevel: NodePrivacyLevel) {
  switch (privacyLevel) {
    case NodePrivacyLevel.MASK:
    case NodePrivacyLevel.HIDDEN:
    case NodePrivacyLevel.IGNORE:
      return true
    case NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED:
      if (isTextNode(node)) {
        // Always return true if our parent is a form element, like MASK_USER_INPUT.
        // Otherwise, decide whether to mask based on the allowlist.
        return isFormElement(node.parentNode) ? true : !isAllowlisted(node.textContent || '')
      }
      // Always return true if we're a form element, like MASK_USER_INPUT.
      // Otherwise, return false; MASK_UNLESS_ALLOWLISTED only directly masks text nodes.
      return isFormElement(node)
    case NodePrivacyLevel.MASK_USER_INPUT:
      return isTextNode(node) ? isFormElement(node.parentNode) : isFormElement(node)
    default:
      return false
  }
}

export function shouldMaskAttribute(
  tagName: string,
  attributeName: string,
  attributeValue: string | null,
  nodePrivacyLevel: NodePrivacyLevel,
  configuration: RumConfiguration
) {
  if (nodePrivacyLevel !== NodePrivacyLevel.MASK && nodePrivacyLevel !== NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED) {
    return false
  }
  if (
    attributeName === PRIVACY_ATTR_NAME ||
    STABLE_ATTRIBUTES.includes(attributeName) ||
    attributeName === configuration.actionNameAttribute
  ) {
    return false
  }

  switch (attributeName) {
    case 'title':
    case 'alt':
    case 'placeholder':
      return true
  }
  if (tagName === 'A' && attributeName === 'href') {
    return true
  }
  if (tagName === 'IFRAME' && attributeName === 'srcdoc') {
    return true
  }
  if (attributeValue && attributeName.startsWith('data-')) {
    return true
  }
  if ((tagName === 'IMG' || tagName === 'SOURCE') && (attributeName === 'src' || attributeName === 'srcset')) {
    return true
  }

  return false
}

function isFormElement(node: Node | null): boolean {
  if (!node || node.nodeType !== node.ELEMENT_NODE) {
    return false
  }
  const element = node as HTMLInputElement
  if (element.tagName === 'INPUT') {
    switch (element.type) {
      case 'button':
      case 'color':
      case 'reset':
      case 'submit':
        return false
    }
  }
  return !!FORM_PRIVATE_TAG_NAMES[element.tagName]
}

/**
 * Text censoring non-destructively maintains whitespace characters in order to preserve text shape
 * during replay.
 */
const censorText = (text: string) => text.replace(/\S/g, TEXT_MASKING_CHAR)

export function getTextContent(textNode: Node, parentNodePrivacyLevel: NodePrivacyLevel): string | undefined {
  // The parent node may not be a html element which has a tagName attribute.
  // So just let it be undefined which is ok in this use case.
  const parentTagName = textNode.parentElement?.tagName
  let textContent = textNode.textContent || ''

  const shouldIgnoreWhiteSpace = parentTagName === 'HEAD'
  if (shouldIgnoreWhiteSpace && !textContent.trim()) {
    return
  }

  const nodePrivacyLevel = parentNodePrivacyLevel

  const isScript = parentTagName === 'SCRIPT'

  if (isScript) {
    // For perf reasons, we don't record script (heuristic)
    textContent = CENSORED_STRING_MARK
  } else if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    // Should never occur, but just in case, we set to CENSORED_MARK.
    textContent = CENSORED_STRING_MARK
  } else if (shouldMaskNode(textNode, nodePrivacyLevel)) {
    if (
      // Scrambling the child list breaks text nodes for DATALIST/SELECT/OPTGROUP
      parentTagName === 'DATALIST' ||
      parentTagName === 'SELECT' ||
      parentTagName === 'OPTGROUP'
    ) {
      if (!textContent.trim()) {
        return
      }
    } else if (parentTagName === 'OPTION') {
      // <Option> has low entropy in charset + text length, so use `CENSORED_STRING_MARK` when masked
      textContent = CENSORED_STRING_MARK
    } else if (nodePrivacyLevel === NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED) {
      textContent = maskDisallowedTextContent(textContent)
    } else {
      textContent = censorText(textContent)
    }
  }
  return textContent
}

/**
 * TODO: Preserve CSS element order, and record the presence of the tag, just don't render
 * We don't need this logic on the recorder side.
 * For security related meta's, customer can mask themmanually given they
 * are easy to identify in the HEAD tag.
 */
export function shouldIgnoreElement(element: Element): boolean {
  if (element.nodeName === 'SCRIPT') {
    return true
  }

  if (element.nodeName === 'LINK') {
    const relAttribute = getLowerCaseAttribute('rel')
    return (
      // Link as script - Ignore only when rel=preload, modulepreload or prefetch
      (/preload|prefetch/i.test(relAttribute) && getLowerCaseAttribute('as') === 'script') ||
      // Favicons
      relAttribute === 'shortcut icon' ||
      relAttribute === 'icon'
    )
  }

  if (element.nodeName === 'META') {
    const nameAttribute = getLowerCaseAttribute('name')
    const relAttribute = getLowerCaseAttribute('rel')
    const propertyAttribute = getLowerCaseAttribute('property')
    return (
      // Favicons
      /^msapplication-tile(image|color)$/.test(nameAttribute) ||
      nameAttribute === 'application-name' ||
      relAttribute === 'icon' ||
      relAttribute === 'apple-touch-icon' ||
      relAttribute === 'shortcut icon' ||
      // Description
      nameAttribute === 'keywords' ||
      nameAttribute === 'description' ||
      // Social
      /^(og|twitter|fb):/.test(propertyAttribute) ||
      /^(og|twitter):/.test(nameAttribute) ||
      nameAttribute === 'pinterest' ||
      // Robots
      nameAttribute === 'robots' ||
      nameAttribute === 'googlebot' ||
      nameAttribute === 'bingbot' ||
      // Http headers. Ex: X-UA-Compatible, Content-Type, Content-Language, cache-control,
      // X-Translated-By
      element.hasAttribute('http-equiv') ||
      // Authorship
      nameAttribute === 'author' ||
      nameAttribute === 'generator' ||
      nameAttribute === 'framework' ||
      nameAttribute === 'publisher' ||
      nameAttribute === 'progid' ||
      /^article:/.test(propertyAttribute) ||
      /^product:/.test(propertyAttribute) ||
      // Verification
      nameAttribute === 'google-site-verification' ||
      nameAttribute === 'yandex-verification' ||
      nameAttribute === 'csrf-token' ||
      nameAttribute === 'p:domain_verify' ||
      nameAttribute === 'verify-v1' ||
      nameAttribute === 'verification' ||
      nameAttribute === 'shopify-checkout-api-token'
    )
  }

  function getLowerCaseAttribute(name: string) {
    return (element.getAttribute(name) || '').toLowerCase()
  }

  return false
}

export interface BrowserWindow extends Window {
  $DD_ALLOW?: Set<string>
}

export function isAllowlisted(text: string): boolean {
  if (!text || !text.trim()) {
    return true
  }
  // We are using toLocaleLowerCase when adding to the allowlist to avoid case sensitivity
  // so we need to do the same here
  return (window as BrowserWindow).$DD_ALLOW?.has(text.toLocaleLowerCase()) || false
}

export function maskDisallowedTextContent(text: string, fixedMask?: string): string {
  if (isAllowlisted(text)) {
    return text
  }
  return fixedMask || censorText(text)
}
