export function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}

export function isCommentNode(node: Node): node is Comment {
  return node.nodeType === Node.COMMENT_NODE
}

export function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

export function isCanvasElement(node: Node): node is HTMLCanvasElement {
  return isElementNode(node) && node.tagName === 'CANVAS'
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

/**
 * Return the value of a node property from the getter defined on `Node.prototype`.
 * It ignores overrides defined on the node itself or on prototypes between the node and `Node.prototype`.
 * Some frameworks override these getters on their elements to hide the nodes they render
 * (ex: Stencil scoped components with slots, used by Ionic).
 */
export function getFromNodePrototype(node: Node, name: 'firstChild' | 'nextSibling' | 'parentNode'): Node | null {
  return Reflect.get(Node.prototype, name, node)
}

export function forEachChildNodes(node: Node, callback: (child: Node) => void) {
  let child = getFromNodePrototype(node, 'firstChild')

  while (child) {
    callback(child)

    child = getFromNodePrototype(child, 'nextSibling')
  }

  if (isNodeShadowHost(node)) {
    callback(node.shadowRoot)
  }
}

/**
 * Return `host` in case if the current node is a shadow root otherwise will return the `parentNode`
 */
export function getParentNode(node: Node): Node | null {
  return isNodeShadowRoot(node) ? node.host : getFromNodePrototype(node, 'parentNode')
}

/**
 * Return the parent element, crossing shadow DOM boundaries.
 * If the element is a direct child of a shadow root, returns the shadow host.
 */
export function getParentElement(element: Element): Element | null {
  if (element.parentElement) {
    return element.parentElement
  }
  const parentNode = element.parentNode
  if (parentNode && isNodeShadowRoot(parentNode)) {
    return parentNode.host
  }
  return null
}
