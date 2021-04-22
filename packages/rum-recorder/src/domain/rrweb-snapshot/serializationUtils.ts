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

export function nodeIsIgnored(n: Node): boolean {
  return getSerializedNodeId(n) === IGNORED_NODE_ID
}

export function nodeOrAncestorsIsIgnored(n: Node) {
  let current: Node | null = n
  while (current) {
    if (nodeIsIgnored(current)) {
      return true
    }
    current = current.parentNode
  }
  return false
}
