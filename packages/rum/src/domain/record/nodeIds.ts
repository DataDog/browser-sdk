import { getParentNode, isNodeShadowRoot } from '@datadog/browser-rum-core'

export type NodeWithSerializedNode = Node & { __brand: 'NodeWithSerializedNode' }
export type NodeId = number & { __brand: 'NodeId' }

export const enum NodeIdConstants {
  FIRST_ID = 1,
}

export interface NodeIds {
  assign(node: Node): NodeId
  get(node: Node): NodeId | undefined
  areAssignedForNodeAndAncestors(node: Node): node is NodeWithSerializedNode
}

export function createNodeIds(): NodeIds {
  const nodeIds = new WeakMap<Node, NodeId>()
  let nextNodeId = NodeIdConstants.FIRST_ID

  const get = (node: Node): NodeId | undefined => nodeIds.get(node)

  return {
    assign: (node: Node): NodeId => {
      // Try to reuse any existing id.
      let nodeId = get(node)
      if (nodeId === undefined) {
        nodeId = nextNodeId++ as NodeId
        nodeIds.set(node, nodeId)
      }
      return nodeId
    },

    get,

    areAssignedForNodeAndAncestors: (node: Node): node is NodeWithSerializedNode => {
      let current: Node | null = node
      while (current) {
        if (get(current) === undefined && !isNodeShadowRoot(current)) {
          return false
        }
        current = getParentNode(current)
      }
      return true
    },
  }
}
