import { INode } from './types'

export function hasSerializedNode(n: Node): n is INode {
  return '__sn' in n
}
