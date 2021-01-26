const PRIVACY_ATTR_NAME = 'data-dd-privacy'
const PRIVACY_ATTR_VALUE_HIDDEN = 'hidden'

const PRIVACY_CLASS_HIDDEN = 'dd-privacy-hidden'

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

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}
