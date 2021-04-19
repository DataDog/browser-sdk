import { forEach } from '../rrweb/utils'
import { INode, SerializedNodeWithId } from './types'

export function hasSerializedNode(n: Node): n is INode {
  return '__sn' in n
}

export function getSerializedNodeId(n: Node) {
  // if n is not a serialized INode, use -1 as its id.
  if (!hasSerializedNode(n)) {
    return -1
  }
  return n.__sn.id // eslint-disable-line no-underscore-dangle
}

export function setSerializedNode(n: Node, serializeNode: SerializedNodeWithId) {
  // eslint-disable-next-line no-underscore-dangle
  ;(n as Partial<INode>).__sn = serializeNode
}

export function recursivelyRemoveSerializedNodes(n: Node) {
  // eslint-disable-next-line no-underscore-dangle
  delete (n as Partial<INode>).__sn
  forEach(n.childNodes, recursivelyRemoveSerializedNodes)
}
