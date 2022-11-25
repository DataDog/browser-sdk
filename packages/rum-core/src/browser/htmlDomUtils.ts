export function isTextNode(node: Node): node is Text {
  return node.nodeType === node.TEXT_NODE
}

export function isCommentNode(node: Node): node is Comment {
  return node.nodeType === node.COMMENT_NODE
}

export function isElementNode(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

export function isShadowRoot(node: Node): node is ShadowRoot {
  const shadowRoot = node as ShadowRoot
  return !!shadowRoot.host && isElementNode(shadowRoot.host)
}

export function getChildNodes(node: Node) {
  return isElementNode(node) && node.shadowRoot ? node.shadowRoot.childNodes : node.childNodes
}

export function getNodeOrShadowHost(node: Node): Node {
  return isShadowRoot(node) ? node.host : node
}

export function getParentNode(node: Node): Node | null {
  const parentNode = node.parentNode
  if (!parentNode) {
    return null
  }
  return getNodeOrShadowHost(parentNode)
}
