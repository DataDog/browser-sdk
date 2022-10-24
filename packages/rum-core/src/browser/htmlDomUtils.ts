export function isTextNode(node: Node): node is Text {
  return node.nodeType === node.TEXT_NODE
}

export function isCommentNode(node: Node): node is Comment {
  return node.nodeType === node.COMMENT_NODE
}

export function isElementNode(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

export function getChildNodes(node: Node) {
  return isElementNode(node) && node.shadowRoot ? node.shadowRoot.childNodes : node.childNodes
}
