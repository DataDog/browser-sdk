import {
  InputPrivacyMode,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_INPUT_IGNORED,
  PRIVACY_ATTR_VALUE_INPUT_MASKED,
  PRIVACY_CLASS_HIDDEN,
  PRIVACY_CLASS_INPUT_IGNORED,
  PRIVACY_CLASS_INPUT_MASKED,
} from '../../constants'

// PRIVACY_INPUT_TYPES_TO_IGNORE defines the input types whose input
// events we want to ignore by default, as they often contain PII.
// TODO: We might want to differentiate types to fully ignore vs types
// to obfuscate.
const PRIVACY_INPUT_TYPES_TO_IGNORE = ['email', 'password', 'tel']

// Returns true if the given DOM node should be hidden. Ancestors
// are not checked.
export function nodeShouldBeHidden(node: Node): boolean {
  return (
    isElement(node) &&
    (node.getAttribute(PRIVACY_ATTR_NAME) === PRIVACY_ATTR_VALUE_HIDDEN ||
      node.classList.contains(PRIVACY_CLASS_HIDDEN))
  )
}

// Returns true if the given DOM node should be hidden, recursively
// checking its ancestors.
export function nodeOrAncestorsShouldBeHidden(node: Node | null): boolean {
  if (!node) {
    return false
  }

  if (nodeShouldBeHidden(node)) {
    return true
  }

  return nodeOrAncestorsShouldBeHidden(node.parentNode)
}

/**
 * Returns the given node input privacy mode without checking the privacy mode on the node
 * ancestors. Returns 'undefined' if the privacy mode cannot be determined and should be taken from
 * an ancestor.
 */
export function getNodeInputPrivacyMode(node: Node): InputPrivacyMode | undefined {
  if (!isElement(node)) {
    return InputPrivacyMode.NONE
  }

  const attribute = node.getAttribute(PRIVACY_ATTR_NAME)
  if (attribute === PRIVACY_ATTR_VALUE_INPUT_IGNORED) {
    return InputPrivacyMode.IGNORED
  }

  if (attribute === PRIVACY_ATTR_VALUE_INPUT_MASKED) {
    return InputPrivacyMode.MASKED
  }

  if (node.classList.contains(PRIVACY_CLASS_INPUT_IGNORED)) {
    return InputPrivacyMode.IGNORED
  }

  if (node.classList.contains(PRIVACY_CLASS_INPUT_MASKED)) {
    return InputPrivacyMode.MASKED
  }

  if (isInputElement(node) && PRIVACY_INPUT_TYPES_TO_IGNORE.includes(node.type)) {
    return InputPrivacyMode.IGNORED
  }
}

/**
 * Returns the given node input privacy mode. This function is costly because it checks all of the
 * node ancestors.
 */
export function getNodeOrAncestorsInputPrivacyMode(node: Node): InputPrivacyMode {
  let currentNode: Node | null = node
  while (currentNode) {
    const inputPrivacyMode = getNodeInputPrivacyMode(currentNode)
    if (inputPrivacyMode) {
      return inputPrivacyMode
    }
    currentNode = currentNode.parentNode
  }

  return InputPrivacyMode.NONE
}

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

function isInputElement(elem: Element): elem is HTMLInputElement {
  return elem.tagName === 'INPUT'
}
