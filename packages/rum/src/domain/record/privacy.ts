import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_CLASS_ALLOW,
  PRIVACY_CLASS_MASK,
  PRIVACY_CLASS_MASK_USER_INPUT,
  PRIVACY_CLASS_HIDDEN,
  FORM_PRIVATE_TAG_NAMES,
  CENSORED_STRING_MARK,
} from '../../constants'

export const MAX_ATTRIBUTE_VALUE_CHAR_LENGTH = 100_000

const TEXT_MASKING_CHAR = 'x'

/**
 * Get node privacy level by iterating over its ancestors. When the direct parent privacy level is
 * know, it is best to use something like:
 *
 * derivePrivacyLevelGivenParent(getNodeSelfPrivacyLevel(node), parentNodePrivacyLevel)
 */
export function getNodePrivacyLevel(node: Node, defaultPrivacyLevel: NodePrivacyLevel): NodePrivacyLevel {
  const parentNodePrivacyLevel = node.parentNode
    ? getNodePrivacyLevel(node.parentNode, defaultPrivacyLevel)
    : defaultPrivacyLevel
  const selfNodePrivacyLevel = getNodeSelfPrivacyLevel(node)
  return reducePrivacyLevel(selfNodePrivacyLevel, parentNodePrivacyLevel)
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
  if (!isElement(node)) {
    return
  }

  const privAttr = node.getAttribute(PRIVACY_ATTR_NAME)

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
    // Handle input[autocomplete=cc-number/cc-csc/cc-exp/cc-exp-month/cc-exp-year]
    if (autocomplete && autocomplete.indexOf('cc-') === 0) {
      return NodePrivacyLevel.MASK
    }
  }

  // Check HTML privacy attributes and classes
  if (privAttr === PRIVACY_ATTR_VALUE_HIDDEN || node.classList.contains(PRIVACY_CLASS_HIDDEN)) {
    return NodePrivacyLevel.HIDDEN
  }

  if (privAttr === PRIVACY_ATTR_VALUE_MASK || node.classList.contains(PRIVACY_CLASS_MASK)) {
    return NodePrivacyLevel.MASK
  }

  if (privAttr === PRIVACY_ATTR_VALUE_MASK_USER_INPUT || node.classList.contains(PRIVACY_CLASS_MASK_USER_INPUT)) {
    return NodePrivacyLevel.MASK_USER_INPUT
  }

  if (privAttr === PRIVACY_ATTR_VALUE_ALLOW || node.classList.contains(PRIVACY_CLASS_ALLOW)) {
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
    case NodePrivacyLevel.MASK_USER_INPUT:
      return isTextNode(node) ? isFormElement(node.parentNode) : isFormElement(node)
    default:
      return false
  }
}

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === node.TEXT_NODE
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
export const censorText = (text: string) => text.replace(/\S/g, TEXT_MASKING_CHAR)

export function getTextContent(
  textNode: Node,
  ignoreWhiteSpace: boolean,
  parentNodePrivacyLevel: NodePrivacyLevel
): string | undefined {
  // The parent node may not be a html element which has a tagName attribute.
  // So just let it be undefined which is ok in this use case.
  const parentTagName = textNode.parentElement?.tagName
  let textContent = textNode.textContent || ''

  if (ignoreWhiteSpace && !textContent.trim()) {
    return
  }

  const nodePrivacyLevel = parentNodePrivacyLevel

  const isStyle = parentTagName === 'STYLE' ? true : undefined
  const isScript = parentTagName === 'SCRIPT'

  if (isScript) {
    // For perf reasons, we don't record script (heuristic)
    textContent = CENSORED_STRING_MARK
  } else if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    // Should never occur, but just in case, we set to CENSORED_MARK.
    textContent = CENSORED_STRING_MARK
  } else if (
    shouldMaskNode(textNode, nodePrivacyLevel) &&
    // Style tags are `overruled` (Use `hide` to enforce privacy)
    !isStyle
  ) {
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
      // Scripts
      (relAttribute === 'preload' && getLowerCaseAttribute('as') === 'script') ||
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
