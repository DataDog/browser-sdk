import {
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_CLASS_HIDDEN,
  PRIVACY_ATTR_VALUE_INPUT_IGNORED,
  PRIVACY_CLASS_INPUT_IGNORED,
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

// Returns true if the given DOM node should have it's input events
// ignored. Ancestors are not checked.
export function nodeShouldHaveInputIgnored(node: Node): boolean {
  return (
    isElement(node) &&
    (node.getAttribute(PRIVACY_ATTR_NAME) === PRIVACY_ATTR_VALUE_INPUT_IGNORED ||
      node.classList.contains(PRIVACY_CLASS_INPUT_IGNORED) ||
      // if element is an HTMLInputElement, check the type is not to be ignored by default
      (isInputElement(node) && PRIVACY_INPUT_TYPES_TO_IGNORE.includes(node.type)))
  )
}

// Returns true if the given DOM node should have it's input events
// ignored, recursively checking its ancestors.
export function nodeOrAncestorsShouldHaveInputIgnored(node: Node | null): boolean {
  if (!node) {
    return false
  }

  if (nodeShouldHaveInputIgnored(node)) {
    return true
  }

  return nodeOrAncestorsShouldHaveInputIgnored(node.parentNode)
}

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

function isInputElement(elem: Element): elem is HTMLInputElement {
  return elem.tagName === 'INPUT'
}
