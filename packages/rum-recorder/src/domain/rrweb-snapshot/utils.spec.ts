import {
  getSerializedNodeId,
  hasSerializedNode,
  recursivelyRemoveSerializedNodes,
  SERIALIZED_NODE_ID_NOT_FOUND,
  setSerializedNode,
} from './utils'

describe('serialized Node storage in DOM Nodes', () => {
  describe('hasSerializedNode', () => {
    it('returns false for DOM Nodes that are not yet serialized', () => {
      expect(hasSerializedNode(document.createElement('div'))).toBe(false)
    })

    it('returns true for DOM Nodes that have been serialized', () => {
      const node = document.createElement('div')
      setSerializedNode(node, {} as any)

      expect(hasSerializedNode(node)).toBe(true)
    })

    it('returns false if the serialized Node have been removed', () => {
      const node = document.createElement('div')
      setSerializedNode(node, {} as any)
      recursivelyRemoveSerializedNodes(node)

      expect(hasSerializedNode(node)).toBe(false)
    })
  })

  describe('getSerializedNodeId', () => {
    it('returns SERIALIZED_NODE_ID_NOT_FOUND for DOM Nodes that are not yet serialized', () => {
      expect(getSerializedNodeId(document.createElement('div'))).toBe(SERIALIZED_NODE_ID_NOT_FOUND)
    })

    it('returns the serialized Node id', () => {
      const node = document.createElement('div')
      setSerializedNode(node, { id: 42 } as any)

      expect(getSerializedNodeId(node)).toBe(42)
    })

    it('returns SERIALIZED_NODE_ID_NOT_FOUND if the serialized Node have been removed', () => {
      const node = document.createElement('div')
      setSerializedNode(node, {} as any)
      recursivelyRemoveSerializedNodes(node)

      expect(getSerializedNodeId(node)).toBe(SERIALIZED_NODE_ID_NOT_FOUND)
    })
  })

  describe('recursivelyRemoveSerializedNodes', () => {
    it('removes serialized Node on the provided DOM Node children', () => {
      const parent = document.createElement('div')
      const child = document.createElement('div')
      parent.appendChild(child)
      setSerializedNode(child, {} as any)

      recursivelyRemoveSerializedNodes(parent)

      expect(hasSerializedNode(child)).toBe(false)
    })
  })
})
