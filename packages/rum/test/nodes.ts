// Returns the textContent of a ElementNode, if any.
import type { SerializedNodeWithId, ElementNode, SerializedNode, TextNode } from '../src/types'
import { NodeType } from '../src/types'

export function findTextContent(elem: ElementNode): string | null {
  const text = elem.childNodes.find((child) => child.type === NodeType.Text) as TextNode
  return text ? text.textContent : null
}

// Returns the first ElementNode with the given ID attribute contained in a node, if any.
export function findElementWithIdAttribute(root: SerializedNodeWithId, id: string) {
  return findElement(root, (node) => node.attributes.id === id)
}

// Returns the first ElementNode with the given tag name contained in a node, if any.
export function findElementWithTagName(root: SerializedNodeWithId, tagName: string) {
  return findElement(root, (node) => node.tagName === tagName)
}

// Returns the first TextNode with the given content contained in a node, if any.
export function findTextNode(root: SerializedNodeWithId, textContent: string) {
  return findNode(root, (node) => isTextNode(node) && node.textContent === textContent) as
    | (TextNode & { id: number })
    | null
}

// Returns the first ElementNode matching the predicate
export function findElement(root: SerializedNodeWithId, predicate: (node: ElementNode) => boolean) {
  return findNode(root, (node) => isElementNode(node) && predicate(node)) as (ElementNode & { id: number }) | null
}

// Returns the first SerializedNodeWithId matching the predicate
export function findNode(
  node: SerializedNodeWithId,
  predicate: (node: SerializedNodeWithId) => boolean
): SerializedNodeWithId | null {
  if (predicate(node)) {
    return node
  }

  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      const node = findNode(child, predicate)
      if (node !== null) {
        return node
      }
    }
  }
  return null
}

function isElementNode(node: SerializedNode): node is ElementNode {
  return node.type === NodeType.Element
}

function isTextNode(node: SerializedNode): node is TextNode {
  return node.type === NodeType.Text
}
