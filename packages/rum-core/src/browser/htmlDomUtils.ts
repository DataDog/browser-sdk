export function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}

export function isCommentNode(node: Node): node is Comment {
  return node.nodeType === Node.COMMENT_NODE
}

export function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

export function isNodeShadowHost(node: Node): node is Element & { shadowRoot: ShadowRoot } {
  return isElementNode(node) && Boolean(node.shadowRoot)
}

export function isNodeShadowRoot(node: Node): node is ShadowRoot {
  const shadowRoot = node as ShadowRoot
  return !!shadowRoot.host && shadowRoot.nodeType === Node.DOCUMENT_FRAGMENT_NODE && isElementNode(shadowRoot.host)
}

export function hasChildNodes(node: Node) {
  return node.childNodes.length > 0 || isNodeShadowHost(node)
}

export function forEachChildNodes(node: Node, callback: (child: Node) => void) {
  let child = node.firstChild

  while (child) {
    callback(child)

    child = child.nextSibling
  }

  if (isNodeShadowHost(node)) {
    callback(node.shadowRoot)
  }
}

/**
 * Return `host` in case if the current node is a shadow root otherwise will return the `parentNode`
 */
export function getParentNode(node: Node): Node | null {
  return isNodeShadowRoot(node) ? node.host : node.parentNode
}

/**
 * Return the classList of an element or an array of classes if classList is not supported
 *
 * In cases where classList is not supported, such as in IE11 for SVG and MathML elements,
 * we fallback to using element.getAttribute('class').
 * We opt for element.getAttribute('class') over element.className because className returns an SVGAnimatedString for SVG elements.
 */
export function getClassList(element: Element): DOMTokenList | string[] {
  if (element.classList) {
    return element.classList
  }

  return (element.getAttribute('class') || '').split(/\s+/)
}
