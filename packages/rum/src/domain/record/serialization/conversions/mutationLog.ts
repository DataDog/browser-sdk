import type { NodeId } from '../../itemIds'

type ParentNodeId = NodeId

export interface MutationLog {
  onAttributeChanged(nodeId: NodeId, name: string): void
  onNodeConnected(nodeId: NodeId): void
  onNodeDisconnected(nodeId: NodeId, parentId: ParentNodeId): void
  onTextChanged(nodeId: NodeId): void

  clear(): void

  attributeChanges: Map<NodeId, Set<string>>
  nodeAdds: Set<NodeId>
  nodeRemoves: Map<NodeId, ParentNodeId>
  textChanges: Set<NodeId>
}

export function createMutationLog(): MutationLog {
  const self: MutationLog = {
    onAttributeChanged(nodeId: NodeId, name: string): void {
      let changedAttributes = self.attributeChanges.get(nodeId)
      if (!changedAttributes) {
        changedAttributes = new Set<string>()
        self.attributeChanges.set(nodeId, changedAttributes)
      }
      changedAttributes.add(name)
    },

    onNodeConnected(nodeId: NodeId): void {
      self.nodeAdds.add(nodeId)
    },

    onNodeDisconnected(nodeId: NodeId, parentId: ParentNodeId): void {
      self.nodeRemoves.set(nodeId, parentId)
    },

    onTextChanged(nodeId: NodeId): void {
      self.textChanges.add(nodeId)
    },

    clear(): void {
      self.attributeChanges.clear()
      self.nodeAdds.clear()
      self.nodeRemoves.clear()
      self.textChanges.clear()
    },

    attributeChanges: new Map<NodeId, Set<string>>(),
    nodeAdds: new Set<NodeId>(),
    nodeRemoves: new Map<NodeId, ParentNodeId>(),
    textChanges: new Set<NodeId>(),
  }

  return self
}
