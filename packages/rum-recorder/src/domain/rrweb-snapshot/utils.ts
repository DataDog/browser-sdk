import { forEach } from '../rrweb/utils'
import { SerializedNodeWithId } from './types'

interface NodeWithSerializedNode extends Node {
  __sn: SerializedNodeWithId
}

export function hasSerializedNode(n: Node): n is NodeWithSerializedNode {
  return '__sn' in n
}

export function getSerializedNodeId(n: Node) {
  // if n doesn't have a serialized node, use -1 as its id.
  if (!hasSerializedNode(n)) {
    return -1
  }
  return n.__sn.id // eslint-disable-line no-underscore-dangle
}

export function setSerializedNode(n: Node, serializeNode: SerializedNodeWithId) {
  // eslint-disable-next-line no-underscore-dangle
  ;(n as Partial<NodeWithSerializedNode>).__sn = serializeNode
}

export function recursivelyRemoveSerializedNodes(n: Node) {
  // eslint-disable-next-line no-underscore-dangle
  delete (n as Partial<NodeWithSerializedNode>).__sn
  forEach(n.childNodes, recursivelyRemoveSerializedNodes)
}
