import { getParentNode, isNodeShadowRoot } from '@datadog/browser-rum-core'

export type NodeWithSerializedNode = Node & { __brand: 'NodeWithSerializedNode' }
export type NodeId = number & { __brand: 'NodeId' }

export interface SerializationScope {
  assignSerializedNodeId(node: Node): NodeId
  getSerializedNodeId(node: Node): NodeId | undefined
  nodeAndAncestorsHaveSerializedNode(node: Node): node is NodeWithSerializedNode
}

export const enum NodeIds {
  FIRST = 1,
}

export function createSerializationScope(): SerializationScope {
  const nodeIds = new WeakMap<Node, NodeId>()
  let nextNodeId = NodeIds.FIRST

  const getSerializedNodeId = (node: Node): NodeId | undefined => nodeIds.get(node)

  return {
    assignSerializedNodeId: (node: Node): NodeId => {
      // Try to reuse any existing id.
      let nodeId = getSerializedNodeId(node)
      if (nodeId === undefined) {
        nodeId = nextNodeId++ as NodeId
        nodeIds.set(node, nodeId)
      }
      return nodeId
    },

    getSerializedNodeId,

    nodeAndAncestorsHaveSerializedNode: (node: Node): node is NodeWithSerializedNode => {
      let current: Node | null = node
      while (current) {
        if (getSerializedNodeId(current) === undefined && !isNodeShadowRoot(current)) {
          return false
        }
        current = getParentNode(current)
      }
      return true
    },
  }
}
