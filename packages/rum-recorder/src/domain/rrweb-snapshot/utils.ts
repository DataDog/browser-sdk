import { INode } from './types'

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
