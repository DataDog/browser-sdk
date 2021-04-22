import {
  getSerializedNodeId,
  hasSerializedNode,
  SERIALIZED_NODE_ID_NOT_FOUND,
  setSerializedNode,
} from './serializationUtils'

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
  })
})
