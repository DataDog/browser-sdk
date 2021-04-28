import { SerializedNodeWithId } from './types'

export const IGNORED_NODE_ID = -2

export interface NodeWithSerializedNode extends Node {
  __sn: SerializedNodeWithId
}

export function hasSerializedNode(n: Node): n is NodeWithSerializedNode {
  return '__sn' in n
}

export function getSerializedNodeId(n: NodeWithSerializedNode): number
export function getSerializedNodeId(n: Node): number | undefined
export function getSerializedNodeId(n: Node) {
  return hasSerializedNode(n) ? n.__sn.id : undefined
}

export function setSerializedNode(n: Node, serializeNode: SerializedNodeWithId) {
  ;(n as Partial<NodeWithSerializedNode>).__sn = serializeNode
}

export function nodeIsIgnored(n: NodeWithSerializedNode): boolean {
  return getSerializedNodeId(n) === IGNORED_NODE_ID
}

export function nodeOrAncestorsIsIgnored(n: NodeWithSerializedNode) {
  let current: NodeWithSerializedNode | null = n
  while (current) {
    if (nodeIsIgnored(current)) {
      return true
    }
    // Since we serialize the document from the root, and any new node is only serialized if they
    // are added in a serialized node, we are guaranteed to have a serialized parent node here.
    current = current.parentNode as NodeWithSerializedNode | null
  }
  return false
}
