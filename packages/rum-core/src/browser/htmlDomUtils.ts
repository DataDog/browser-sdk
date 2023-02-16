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

export function getChildNodes(node: Node) {
  return isNodeShadowHost(node) ? node.shadowRoot.childNodes : node.childNodes
}

/**
 * Return `host` in case if the current node is a shadow root otherwise will return the `parentNode`
 */
export function getParentNode(node: Node): Node | null {
  return isNodeShadowRoot(node) ? node.host : node.parentNode
}
