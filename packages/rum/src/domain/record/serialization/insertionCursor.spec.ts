import type { InsertionPoint } from '../../../types'
import type { NodeId } from '../itemIds'
import { createNodeIds } from '../itemIds'
import type { InsertionCursor } from './insertionCursor'
import { createRootInsertionCursor } from './insertionCursor'

describe('InsertionCursor', () => {
  let cursor: InsertionCursor

  beforeEach(() => {
    const nodeIds = createNodeIds()
    cursor = createRootInsertionCursor(nodeIds)
  })

  function createNode(): Node {
    return document.createElement('div')
  }

  type DecodedInsertionPoint =
    | {
        type: 'root'
      }
    | {
        type: 'after'
        previous: NodeId
      }
    | {
        type: 'appendChild'
        parent: NodeId
      }

  function decodeInsertionPoint({
    nodeId,
    insertionPoint,
  }: {
    nodeId: NodeId
    insertionPoint: InsertionPoint
  }): DecodedInsertionPoint {
    if (insertionPoint === null) {
      return { type: 'root' }
    }
    if (insertionPoint === 0) {
      const previous = (nodeId - 1) as NodeId
      return { type: 'after', previous }
    }
    const parent = (nodeId - insertionPoint) as NodeId
    return { type: 'appendChild', parent }
  }

  it('can generate insertion points for a realistic DOM structure', () => {
    const document = createNode()
    const documentResult = cursor.advance(document)
    expect(documentResult.nodeId).toBe(0 as NodeId)
    expect(decodeInsertionPoint(documentResult)).toEqual({ type: 'root' })

    {
      cursor.descend()

      const head = createNode()
      const headResult = cursor.advance(head)
      expect(headResult.nodeId).toBe(1 as NodeId)
      expect(decodeInsertionPoint(headResult)).toEqual({ type: 'appendChild', parent: documentResult.nodeId })

      {
        cursor.descend()

        const title = createNode()
        const titleResult = cursor.advance(title)
        expect(titleResult.nodeId).toBe(2 as NodeId)
        expect(decodeInsertionPoint(titleResult)).toEqual({ type: 'appendChild', parent: headResult.nodeId })

        const style = createNode()
        const styleResult = cursor.advance(style)
        expect(styleResult.nodeId).toBe(3 as NodeId)
        expect(decodeInsertionPoint(styleResult)).toEqual({ type: 'after', previous: titleResult.nodeId })

        cursor.ascend()
      }

      const body = createNode()
      const bodyResult = cursor.advance(body)
      expect(bodyResult.nodeId).toBe(4 as NodeId)
      expect(decodeInsertionPoint(bodyResult)).toEqual({ type: 'appendChild', parent: documentResult.nodeId })

      {
        cursor.descend()

        const div = createNode()
        const divResult = cursor.advance(div)
        expect(divResult.nodeId).toBe(5 as NodeId)
        expect(decodeInsertionPoint(divResult)).toEqual({ type: 'appendChild', parent: bodyResult.nodeId })

        const p = createNode()
        const pResult = cursor.advance(p)
        expect(pResult.nodeId).toBe(6 as NodeId)
        expect(decodeInsertionPoint(pResult)).toEqual({ type: 'after', previous: divResult.nodeId })

        const span = createNode()
        const spanResult = cursor.advance(span)
        expect(spanResult.nodeId).toBe(7 as NodeId)
        expect(decodeInsertionPoint(spanResult)).toEqual({ type: 'after', previous: pResult.nodeId })

        cursor.ascend()
      }

      cursor.ascend()
    }
  })

  describe('advance', () => {
    it('returns a RootInsertionPoint for the root node', () => {
      const root = createNode()
      const result = cursor.advance(root)
      expect(result.nodeId).toBe(0 as NodeId)
      expect(result.insertionPoint).toBe(null)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'root' })
    })

    it('returns an AppendChildInsertionPoint for first siblings', () => {
      const root = createNode()
      const { nodeId: rootNodeId } = cursor.advance(root)
      cursor.descend()

      const firstSibling = createNode()
      const result = cursor.advance(firstSibling)
      expect(result.nodeId).toBe(1 as NodeId)
      expect(result.insertionPoint).toBe(1)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'appendChild', parent: rootNodeId })
    })

    it('returns an InsertAfterPreviousInsertionPoint for sibling nodes', () => {
      const siblingNodes = [createNode(), createNode(), createNode(), createNode()]
      for (let index = 0; index < siblingNodes.length; index++) {
        const result = cursor.advance(siblingNodes[index])
        expect(result.nodeId).toBe(index as NodeId)

        if (index === 0) {
          expect(result.insertionPoint).toBe(null)
          expect(decodeInsertionPoint(result)).toEqual({ type: 'root' })
        } else {
          expect(result.insertionPoint).toBe(0)
          const previous = (index - 1) as NodeId
          expect(decodeInsertionPoint(result)).toEqual({ type: 'after', previous })
        }
      }
    })

    it('reuses existing node ids for the same node', () => {
      const node = createNode()
      const firstNodeId = cursor.advance(node).nodeId
      const secondNodeId = cursor.advance(node).nodeId
      expect(firstNodeId).toBe(secondNodeId)
    })
  })

  describe('descend', () => {
    it('updates insertion point to target the most deeply nested node', () => {
      const root = createNode()
      const rootResult = cursor.advance(root)
      expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })
      cursor.descend()

      const child = createNode()
      const childResult = cursor.advance(child)
      expect(decodeInsertionPoint(childResult)).toEqual({ type: 'appendChild', parent: rootResult.nodeId })
      cursor.descend()

      const grandchild = createNode()
      const grandchildResult = cursor.advance(grandchild)
      expect(decodeInsertionPoint(grandchildResult)).toEqual({ type: 'appendChild', parent: childResult.nodeId })
    })

    it('has no effect if called without a previous advance', () => {
      cursor.descend() // Should have no effect.

      // When we advance, the result should be the same as if descend() was never called.
      const root = createNode()
      const result = cursor.advance(root)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'root' })
    })

    it('has no effect if called multiple times without advancing', () => {
      const root = createNode()
      const rootResult = cursor.advance(root)
      expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

      cursor.descend()
      cursor.descend() // Should have no additional effect.
      cursor.descend() // Should have no additional effect.

      // When we advance, the result should be the same as if descend() was only called once.
      const child = createNode()
      const childResult = cursor.advance(child)
      expect(decodeInsertionPoint(childResult)).toEqual({ type: 'appendChild', parent: rootResult.nodeId })
    })
  })

  describe('ascend', () => {
    it('causes an AppendChildInsertionPoint to be generated for the next advance', () => {
      const root = createNode()
      const rootResult = cursor.advance(root)
      expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

      cursor.descend() // Descend into the root node's child list.

      const parent = createNode()
      const parentResult = cursor.advance(parent)
      expect(decodeInsertionPoint(parentResult)).toEqual({ type: 'appendChild', parent: rootResult.nodeId })

      cursor.descend() // Descend into the parent node's child list.

      const child1 = createNode()
      const child1Result = cursor.advance(child1)
      expect(decodeInsertionPoint(child1Result)).toEqual({ type: 'appendChild', parent: parentResult.nodeId })

      const child2 = createNode()
      const child2Result = cursor.advance(child2)
      expect(decodeInsertionPoint(child2Result)).toEqual({ type: 'after', previous: child1Result.nodeId })

      cursor.ascend() // Ascend out of the parent node's child list.

      // We should use an AppendChildInsertionPoint; an InsertAfterPreviousInsertionPoint
      // would insert the new node as a sibling of `child2`, which is not where it belongs.
      const parentSibling = createNode()
      const parentSiblingResult = cursor.advance(parentSibling)
      expect(decodeInsertionPoint(parentSiblingResult)).toEqual({ type: 'appendChild', parent: rootResult.nodeId })
    })

    it('causes an InsertAfterPreviousInsertionPoint to be generated for the next advance if the subtree was empty', () => {
      const root = createNode()
      const rootResult = cursor.advance(root)
      expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

      cursor.descend() // Descend into the root node's child list.

      const parent = createNode()
      const parentResult = cursor.advance(parent)
      expect(decodeInsertionPoint(parentResult)).toEqual({ type: 'appendChild', parent: rootResult.nodeId })

      cursor.descend() // Descend into the parent node's child list.
      // Do nothing, simulating an empty subtree.
      cursor.ascend() // Ascend out of the parent node's child list.

      // We should use an InsertAfterPreviousInsertionPoint, just as if descend() and
      // ascend() had not been called, because the new node is a sibling of the previous
      // node, `parent`.
      const parentSibling = createNode()
      const parentSiblingResult = cursor.advance(parentSibling)
      expect(decodeInsertionPoint(parentSiblingResult)).toEqual({ type: 'after', previous: parentResult.nodeId })
    })

    it('has no effect if called at the root level', () => {
      cursor.ascend() // Should have no effect.

      // When we advance, the result should be the same as if ascend() was never called.
      const root = createNode()
      const result = cursor.advance(root)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'root' })
    })

    it('has no effect if called without a matching descend', () => {
      const root = createNode()
      const rootResult = cursor.advance(root)
      expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

      cursor.descend() // Descend into the root node's child list.
      cursor.ascend() // Ascend back to the root level.
      cursor.ascend() // Should have no effect.
      cursor.ascend() // Should have no effect.

      // We should insert this node as a sibling of the root, just as if ascend() had only
      // been called once.
      const rootSibling = createNode()
      const rootSiblingResult = cursor.advance(rootSibling)
      expect(decodeInsertionPoint(rootSiblingResult)).toEqual({ type: 'after', previous: rootResult.nodeId })
    })
  })
})
