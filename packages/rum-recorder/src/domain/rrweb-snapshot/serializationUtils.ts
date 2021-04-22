import { SerializedNodeWithId } from './types'

export const SERIALIZED_NODE_ID_NOT_FOUND = -1

interface NodeWithSerializedNode extends Node {
  __sn: SerializedNodeWithId
}

export function hasSerializedNode(n: Node): n is NodeWithSerializedNode {
  return '__sn' in n
}

export function getSerializedNodeId(n: Node) {
  if (!hasSerializedNode(n)) {
    return SERIALIZED_NODE_ID_NOT_FOUND
  }
  return n.__sn.id
}

export function setSerializedNode(n: Node, serializeNode: SerializedNodeWithId) {
  ;(n as Partial<NodeWithSerializedNode>).__sn = serializeNode
}

export function isSerializedNodeId(id: number) {
  return id !== SERIALIZED_NODE_ID_NOT_FOUND
}
