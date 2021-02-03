const PRIVACY_ATTR_NAME = 'data-dd-privacy'
const PRIVACY_ATTR_VALUE_HIDDEN = 'hidden'
const PRIVACY_ATTR_VALUE_INPUT_IGNORED = 'input-ignored'

const PRIVACY_CLASS_HIDDEN = 'dd-privacy-hidden'
const PRIVACY_CLASS_INPUT_IGNORED = 'dd-privacy-input-ignored'

// PRIVACY_INPUT_TYPES_TO_IGNORE defines the input types whose input
// events we want to ignore by default, as they often contain PII.
// TODO: We might want to differentiate types to fully ignore vs types
// to obfuscate.
const PRIVACY_INPUT_TYPES_TO_IGNORE = ['email', 'password', 'tel']

// Returns true if the given DOM node should be hidden. Ancestors
// are not checked.
export function nodeIsHidden(node: Node): boolean {
  return (
    isElement(node) &&
    (node.getAttribute(PRIVACY_ATTR_NAME) === PRIVACY_ATTR_VALUE_HIDDEN ||
      node.classList.contains(PRIVACY_CLASS_HIDDEN))
  )
}

// Returns true if the given DOM node should be hidden, recursively
// checking its ancestors.
export function nodeOrAncestorsAreHidden(node: Node | null): boolean {
  if (!node) {
    return false
  }

  if (nodeIsHidden(node)) {
    return true
  }

  return nodeOrAncestorsAreHidden(node.parentNode)
}

// Returns true if the given DOM node should have it's input events
// ignored. Ancestors are not checked.
export function nodeHasInputIngored(node: Node): boolean {
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
export function nodeOrAncestorsHaveInputIngnored(node: Node | null): boolean {
  if (!node) {
    return false
  }

  if (nodeHasInputIngored(node)) {
    return true
  }

  return nodeOrAncestorsHaveInputIngnored(node.parentNode)
}

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

function isInputElement(elem: Element): elem is HTMLInputElement {
  return elem.tagName === 'INPUT'
}
