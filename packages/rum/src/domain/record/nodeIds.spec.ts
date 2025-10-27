import type { NodeId, NodeIds } from './nodeIds'
import { createNodeIds, NodeIdConstants } from './nodeIds'

describe('NodeIds', () => {
  let nodeIds: NodeIds

  beforeEach(() => {
    nodeIds = createNodeIds()
  })

  describe('assign', () => {
    it('assigns node ids in order', () => {
      for (let id = NodeIdConstants.FIRST_ID as NodeId; id < NodeIdConstants.FIRST_ID + 3; id++) {
        const node = document.createElement('div')
        expect(nodeIds.assign(node)).toBe(id)
        expect(nodeIds.assign(node)).toBe(id)
      }
    })

    it('reuses any existing node id', () => {
      nodeIds.assign(document.createElement('div'))
      nodeIds.assign(document.createElement('div'))
      const node = document.createElement('div')
      const nodeId = nodeIds.assign(node)
      expect(nodeIds.assign(node)).toBe(nodeId)
      expect(nodeIds.get(node)).toBe(nodeId)
    })
  })

  describe('get', () => {
    it('returns undefined for DOM Nodes that have not been assigned an id', () => {
      expect(nodeIds.get(document.createElement('div'))).toBe(undefined)
    })

    it('returns the serialized Node id when available', () => {
      const node = document.createElement('div')
      nodeIds.assign(node)
      expect(nodeIds.get(node)).toBe(NodeIdConstants.FIRST_ID as NodeId)
    })
  })

  describe('areAssignedForNodeAndAncestors', () => {
    it('returns false for DOM Nodes that have not been assigned an id', () => {
      expect(nodeIds.areAssignedForNodeAndAncestors(document.createElement('div'))).toBe(false)
    })

    it('returns true for DOM Nodes that have been assigned an id', () => {
      const node = document.createElement('div')
      nodeIds.assign(node)
      expect(nodeIds.areAssignedForNodeAndAncestors(node)).toBe(true)
    })

    it('returns false for DOM Nodes when an ancestor has not been assigned an id', () => {
      const node = document.createElement('div')
      nodeIds.assign(node)

      const parent = document.createElement('div')
      parent.appendChild(node)
      nodeIds.assign(parent)

      const grandparent = document.createElement('div')
      grandparent.appendChild(parent)

      expect(nodeIds.areAssignedForNodeAndAncestors(node)).toBe(false)
    })

    it('returns true for DOM Nodes when all ancestors have been assigned an id', () => {
      const node = document.createElement('div')
      nodeIds.assign(node)

      const parent = document.createElement('div')
      parent.appendChild(node)
      nodeIds.assign(parent)

      const grandparent = document.createElement('div')
      grandparent.appendChild(parent)
      nodeIds.assign(grandparent)

      expect(nodeIds.areAssignedForNodeAndAncestors(node)).toBe(true)
    })

    it('returns true for DOM Nodes in shadow subtrees', () => {
      const node = document.createElement('div')
      nodeIds.assign(node)

      const parent = document.createElement('div')
      parent.appendChild(node)
      nodeIds.assign(parent)

      const grandparent = document.createElement('div')
      const shadowRoot = grandparent.attachShadow({ mode: 'open' })
      shadowRoot.appendChild(parent)
      nodeIds.assign(grandparent)

      expect(nodeIds.areAssignedForNodeAndAncestors(node)).toBe(true)
    })
  })
})
