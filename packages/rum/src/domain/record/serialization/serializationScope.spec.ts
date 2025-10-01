import type { NodeId, SerializationScope } from './serializationScope'
import { createSerializationScope, NodeIds } from './serializationScope'

describe('SerializationScope', () => {
  let scope: SerializationScope

  beforeEach(() => {
    scope = createSerializationScope()
  })

  describe('assignSerializedNodeId', () => {
    it('assigns node ids in order', () => {
      for (let id = NodeIds.FIRST as NodeId; id < NodeIds.FIRST + 3; id++) {
        const node = document.createElement('div')
        expect(scope.assignSerializedNodeId(node)).toBe(id)
        expect(scope.getSerializedNodeId(node)).toBe(id)
      }
    })

    it('reuses any existing node id', () => {
      scope.assignSerializedNodeId(document.createElement('div'))
      scope.assignSerializedNodeId(document.createElement('div'))
      const node = document.createElement('div')
      const nodeId = scope.assignSerializedNodeId(node)
      expect(scope.assignSerializedNodeId(node)).toBe(nodeId)
      expect(scope.getSerializedNodeId(node)).toBe(nodeId)
    })
  })

  describe('getSerializedNodeId', () => {
    it('returns undefined for DOM Nodes that have not been assigned an id', () => {
      expect(scope.getSerializedNodeId(document.createElement('div'))).toBe(undefined)
    })

    it('returns the serialized Node id when available', () => {
      const node = document.createElement('div')
      scope.assignSerializedNodeId(node)
      expect(scope.getSerializedNodeId(node)).toBe(NodeIds.FIRST as NodeId)
    })
  })

  describe('nodeAndAncestorsHaveSerializedNode', () => {
    it('returns false for DOM Nodes that have not been assigned an id', () => {
      expect(scope.nodeAndAncestorsHaveSerializedNode(document.createElement('div'))).toBe(false)
    })

    it('returns true for DOM Nodes that have been assigned an id', () => {
      const node = document.createElement('div')
      scope.assignSerializedNodeId(node)
      expect(scope.nodeAndAncestorsHaveSerializedNode(node)).toBe(true)
    })

    it('returns false for DOM Nodes when an ancestor has not been assigned an id', () => {
      const node = document.createElement('div')
      scope.assignSerializedNodeId(node)

      const parent = document.createElement('div')
      parent.appendChild(node)
      scope.assignSerializedNodeId(parent)

      const grandparent = document.createElement('div')
      grandparent.appendChild(parent)

      expect(scope.nodeAndAncestorsHaveSerializedNode(node)).toBe(false)
    })

    it('returns true for DOM Nodes when all ancestors have been assigned an id', () => {
      const node = document.createElement('div')
      scope.assignSerializedNodeId(node)

      const parent = document.createElement('div')
      parent.appendChild(node)
      scope.assignSerializedNodeId(parent)

      const grandparent = document.createElement('div')
      grandparent.appendChild(parent)
      scope.assignSerializedNodeId(grandparent)

      expect(scope.nodeAndAncestorsHaveSerializedNode(node)).toBe(true)
    })

    it('returns true for DOM Nodes in shadow subtrees', () => {
      const node = document.createElement('div')
      scope.assignSerializedNodeId(node)

      const parent = document.createElement('div')
      parent.appendChild(node)
      scope.assignSerializedNodeId(parent)

      const grandparent = document.createElement('div')
      const shadowRoot = grandparent.attachShadow({ mode: 'open' })
      shadowRoot.appendChild(parent)
      scope.assignSerializedNodeId(grandparent)

      expect(scope.nodeAndAncestorsHaveSerializedNode(node)).toBe(true)
    })
  })
})
