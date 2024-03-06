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
  node.childNodes.forEach(callback)
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

export function closestElement(targetElement: Element, selectors: string) {
  if ('closest' in HTMLElement.prototype) {
    return targetElement.closest(selectors)
  }

  let element: Element | null = targetElement
  while (element) {
    if (matches(element, selectors)) {
      return element
    }
    element = element.parentElement
  }
}

interface msElement extends Element {
  msMatchesSelector: (selectors: string) => boolean
}

function matches(element: Element, selectors: string) {
  if ('matches' in HTMLElement.prototype) {
    return element.matches(selectors)
  } else if ('msMatchesSelector' in HTMLElement.prototype) {
    return (element as msElement).msMatchesSelector(selectors)
  }
}
