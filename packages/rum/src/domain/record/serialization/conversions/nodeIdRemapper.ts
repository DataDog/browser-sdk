import type { NodeId, NodeIds } from '../../itemIds'
import { createNodeIds } from '../../itemIds'

export interface NodeIdRemapper {
  remap(inputNodeId: NodeId): NodeId
}

export function createIdentityNodeIdRemapper(): NodeIdRemapper {
  return {
    remap(inputNodeId: NodeId): NodeId {
      return inputNodeId
    },
  }
}

export interface CopyingNodeIdRemapper extends NodeIdRemapper {
  inputNodeIds: NodeIds
  outputNodeIds: NodeIds
}

export function createCopyingNodeIdRemapper(): CopyingNodeIdRemapper {
  const { nodeIds: inputNodeIds, nodesByNodeId: inputNodesByNodeId } = createTrackedNodeIds()
  const { nodeIds: outputNodeIds, nodeIdsByNode: outputNodeIdsByNode } = createTrackedNodeIds()

  const self: CopyingNodeIdRemapper = {
    remap(inputNodeId: NodeId): NodeId {
      const node = inputNodesByNodeId.get(inputNodeId)
      if (!node) {
        throw new Error(`Input node id ${inputNodeId} not found`)
      }
      return outputNodeIdsByNode.get(node) ?? outputNodeIds.getOrInsert(node)
    },

    inputNodeIds,
    outputNodeIds,
  }

  return self
}

function createTrackedNodeIds(): {
  nodeIds: NodeIds
  nodeIdsByNode: Map<Node, NodeId>
  nodesByNodeId: Map<NodeId, Node>
} {
  const wrappedNodeIds = createNodeIds()
  const nodeIdsByNode = new Map<Node, NodeId>()
  const nodesByNodeId = new Map<NodeId, Node>()

  const nodeIds: NodeIds = {
    clear: wrappedNodeIds.clear,
    delete: wrappedNodeIds.delete,
    get: wrappedNodeIds.get,
    getOrInsert(node: Node): NodeId {
      const nodeId = wrappedNodeIds.getOrInsert(node)
      nodeIdsByNode.set(node, nodeId)
      nodesByNodeId.set(nodeId, node)
      return nodeId
    },
    get nextId(): NodeId {
      return wrappedNodeIds.nextId
    },
    get size(): number {
      return wrappedNodeIds.size
    },
  }

  return { nodeIds, nodeIdsByNode, nodesByNodeId }
}
