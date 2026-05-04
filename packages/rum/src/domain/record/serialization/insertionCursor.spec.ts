import { beforeEach, describe, expect, it } from 'vitest'
import type { InsertionPoint } from '../../../types'
import type { NodeId, NodeIds } from '../itemIds'
import { createNodeIds } from '../itemIds'
import { createChildInsertionCursor, createRootInsertionCursor } from './insertionCursor'

describe('InsertionCursor', () => {
  let nodeIds: NodeIds

  beforeEach(() => {
    nodeIds = createNodeIds()
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
    | {
        type: 'insertBefore'
        nextSibling: NodeId
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
    if (insertionPoint < 0) {
      const nextSibling = (nodeId + insertionPoint) as NodeId
      return { type: 'insertBefore', nextSibling }
    }
    const parent = (nodeId - insertionPoint) as NodeId
    return { type: 'appendChild', parent }
  }

  it('can generate insertion points for a realistic DOM structure', () => {
    const cursor = createRootInsertionCursor(nodeIds)
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

  describe('createRootInsertionCursor', () => {
    it('can create a cursor that starts at the root of the document', () => {
      const cursor = createRootInsertionCursor(nodeIds)

      // We should generate a RootInsertionPoint for the root node.
      const root = createNode()
      const rootResult = cursor.advance(root)
      expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

      // We should use an AppendAfterPreviousInsertionPoint for subsequent siblings.
      // (Obviously siblings of the root node don't make sense, but we tolerate this
      // situation nonetheless.)
      const nextSibling = createNode()
      const nextSiblingResult = cursor.advance(nextSibling)
      expect(decodeInsertionPoint(nextSiblingResult)).toEqual({ type: 'after', previous: rootResult.nodeId })
    })
  })

  describe('createChildInsertionCursor', () => {
    it('can create a cursor that starts at the end of the child list', () => {
      const rootCursor = createRootInsertionCursor(nodeIds)
      const parentNode = createNode()
      const { nodeId: parentId } = rootCursor.advance(parentNode)

      // Passing 'undefined' for nextSiblingId means that we should insert the new child
      // at the end of the child list.
      const cursor = createChildInsertionCursor(parentId, undefined, nodeIds)

      // We should generate an AppendChildInsertionPoint for the first child.
      const firstChild = createNode()
      const firstChildResult = cursor.advance(firstChild)
      expect(decodeInsertionPoint(firstChildResult)).toEqual({ type: 'appendChild', parent: parentId })

      // We should use an AppendAfterPreviousInsertionPoint for subsequent children.
      const secondChild = createNode()
      const secondChildResult = cursor.advance(secondChild)
      expect(decodeInsertionPoint(secondChildResult)).toEqual({ type: 'after', previous: firstChildResult.nodeId })
    })

    it('can create a cursor that starts before another node in the child list', () => {
      const rootCursor = createRootInsertionCursor(nodeIds)
      const parentNode = createNode()
      const { nodeId: parentId } = rootCursor.advance(parentNode)

      rootCursor.descend()
      const nextSiblingNode = createNode()
      const { nodeId: nextSiblingId } = rootCursor.advance(nextSiblingNode)

      // Passing a nextSiblingId value means we should insert the new node before the
      // given sibling.
      const cursor = createChildInsertionCursor(parentId, nextSiblingId, nodeIds)

      // We should generate an InsertBeforeInsertionPoint for the first new child.
      const firstChild = createNode()
      const firstChildResult = cursor.advance(firstChild)
      expect(decodeInsertionPoint(firstChildResult)).toEqual({ type: 'insertBefore', nextSibling: nextSiblingId })

      // We should use an AppendAfterPreviousInsertionPoint for subsequent children.
      const secondChild = createNode()
      const secondChildResult = cursor.advance(secondChild)
      expect(decodeInsertionPoint(secondChildResult)).toEqual({ type: 'after', previous: firstChildResult.nodeId })
    })
  })

  describe('advance', () => {
    it('returns a RootInsertionPoint for the root node', () => {
      const cursor = createRootInsertionCursor(nodeIds)
      const root = createNode()
      const result = cursor.advance(root)
      expect(result.nodeId).toBe(0 as NodeId)
      expect(result.insertionPoint).toBe(null)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'root' })
    })

    it('returns an AppendChildInsertionPoint for the first child inserted after descending', () => {
      const cursor = createRootInsertionCursor(nodeIds)
      const root = createNode()
      const { nodeId: rootNodeId } = cursor.advance(root)

      // Descend; the cursor now points to the beginning of a new child list.
      cursor.descend()

      const firstSibling = createNode()
      const result = cursor.advance(firstSibling)
      expect(result.nodeId).toBe(1 as NodeId)
      expect(result.insertionPoint).toBe(1)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'appendChild', parent: rootNodeId })
    })

    it('returns an AppendChildInsertionPoint for a new child appended via createChildInsertionCursor', () => {
      const rootCursor = createRootInsertionCursor(nodeIds)
      const parentNode = createNode()
      const { nodeId: parentNodeId } = rootCursor.advance(parentNode)

      // Create an insertion cursor pointing to the end of an existing child list.
      const cursor = createChildInsertionCursor(parentNodeId, undefined, nodeIds)

      const appendedNode = createNode()
      const result = cursor.advance(appendedNode)
      expect(result.nodeId).toBe(1 as NodeId)
      expect(result.insertionPoint).toBe(1)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'appendChild', parent: parentNodeId })
    })

    it('returns an InsertBeforeInsertionPoint for a new child inserted via createChildInsertionCursor', () => {
      const rootCursor = createRootInsertionCursor(nodeIds)
      const parentNode = createNode()
      const { nodeId: parentNodeId } = rootCursor.advance(parentNode)

      rootCursor.descend()
      const existingSiblingNode = createNode()
      const { nodeId: existingSiblingId } = rootCursor.advance(existingSiblingNode)

      // Create an insertion cursor pointing inside an existing child list, directly
      // before existingSiblingNode.
      const cursor = createChildInsertionCursor(parentNodeId, existingSiblingId, nodeIds)

      const insertedNode = createNode()
      const result = cursor.advance(insertedNode)
      expect(result.nodeId).toBe(2 as NodeId)
      expect(result.insertionPoint).toBe(-1)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'insertBefore', nextSibling: existingSiblingId })
    })

    it('returns an InsertAfterPreviousInsertionPoint for sibling nodes', () => {
      const cursor = createRootInsertionCursor(nodeIds)
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
      const cursor = createRootInsertionCursor(nodeIds)
      const node = createNode()
      const firstNodeId = cursor.advance(node).nodeId
      const secondNodeId = cursor.advance(node).nodeId
      expect(firstNodeId).toBe(secondNodeId)
    })
  })

  describe('descend', () => {
    it('updates insertion point to target the most deeply nested node', () => {
      const cursor = createRootInsertionCursor(nodeIds)
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
      const cursor = createRootInsertionCursor(nodeIds)
      cursor.descend() // Should have no effect.

      // When we advance, the result should be the same as if descend() was never called.
      const root = createNode()
      const result = cursor.advance(root)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'root' })
    })

    it('has no effect if called multiple times without advancing', () => {
      const cursor = createRootInsertionCursor(nodeIds)
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
    describe('after a subtree containing at least one node', () => {
      describe("if ascending to a child list that's new", () => {
        it('triggers an AppendChildInsertionPoint at the next advance', () => {
          const cursor = createRootInsertionCursor(nodeIds)
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
      })

      describe("if ascending to an existing child list that's being appended to", () => {
        it('triggers an AppendChildInsertionPoint at the next advance', () => {
          // Use a root InsertionCursor to construct the root node.
          const rootCursor = createRootInsertionCursor(nodeIds)
          const root = createNode()
          const rootResult = rootCursor.advance(root)
          expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

          // Create a new InsertionCursor that appends to the root node's child list.
          const cursor = createChildInsertionCursor(rootResult.nodeId, undefined, nodeIds)

          // Create the parent node using the new InsertionCursor, appending it to the child
          // list of the root node.
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
      })

      describe("if ascending to an existing child list that's being inserted into", () => {
        it('triggers an InsertBeforeInsertionPoint at the next advance', () => {
          // Use a root InsertionCursor to construct the root node and a first child which
          // will end up becoming the parent node's next sibling.
          const rootCursor = createRootInsertionCursor(nodeIds)
          const root = createNode()
          const rootResult = rootCursor.advance(root)
          expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

          rootCursor.descend()
          const parentNextSibling = createNode()
          const parentNextSiblingResult = rootCursor.advance(parentNextSibling)
          expect(decodeInsertionPoint(parentNextSiblingResult)).toEqual({
            type: 'appendChild',
            parent: rootResult.nodeId,
          })

          // Create a new InsertionCursor that inserts into the root node's child list.
          const cursor = createChildInsertionCursor(rootResult.nodeId, parentNextSiblingResult.nodeId, nodeIds)

          // Create the parent node using the new InsertionCursor, inserting it as the first
          // child of the root node.
          const parent = createNode()
          const parentResult = cursor.advance(parent)
          expect(decodeInsertionPoint(parentResult)).toEqual({
            type: 'insertBefore',
            nextSibling: parentNextSiblingResult.nodeId,
          })

          cursor.descend() // Descend into the parent node's child list.

          const child1 = createNode()
          const child1Result = cursor.advance(child1)
          expect(decodeInsertionPoint(child1Result)).toEqual({ type: 'appendChild', parent: parentResult.nodeId })

          const child2 = createNode()
          const child2Result = cursor.advance(child2)
          expect(decodeInsertionPoint(child2Result)).toEqual({ type: 'after', previous: child1Result.nodeId })

          cursor.ascend() // Ascend out of the parent node's child list.

          // We should use an InsertionBeforeInsertionPoint. An InsertAfterPreviousInsertionPoint
          // would insert the new node as a sibling of `child2`, which is not where it
          // belongs. An AppendChildInsertionPoint would insert the new node after
          // `parentNodeNextSibling`, which is again not where it belongs.
          const parentPreviousSibling = createNode()
          const parentPreviousSiblingResult = cursor.advance(parentPreviousSibling)
          expect(decodeInsertionPoint(parentPreviousSiblingResult)).toEqual({
            type: 'insertBefore',
            nextSibling: parentNextSiblingResult.nodeId,
          })
        })
      })
    })

    describe('after an empty subtree', () => {
      describe("if ascending to a child list that's new", () => {
        it('triggers an InsertAfterPreviousInsertionPoint at the next advance', () => {
          // Use a root InsertionCursor to construct the root node.
          const rootCursor = createRootInsertionCursor(nodeIds)
          const root = createNode()
          const rootResult = rootCursor.advance(root)
          expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

          // Create a new InsertionCursor that appends to the root node's child list.
          const cursor = createChildInsertionCursor(rootResult.nodeId, undefined, nodeIds)

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
      })

      describe("if ascending to an existing child list that's being appended to", () => {
        it('triggers an InsertAfterPreviousInsertionPoint at the next advance', () => {
          const cursor = createRootInsertionCursor(nodeIds)
          const root = createNode()
          const rootResult = cursor.advance(root)
          expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

          cursor.descend() // Descend into the root node's child list.

          // Create the parent node using the new InsertionCursor, appending it to the child
          // list of the root node.
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
      })

      describe("if ascending to an existing child list that's being inserted into", () => {
        it('triggers an InsertAfterPreviousInsertionPoint at the next advance', () => {
          // Use a root InsertionCursor to construct the root node and a first child which
          // will end up becoming the parent node's next sibling.
          const rootCursor = createRootInsertionCursor(nodeIds)
          const root = createNode()
          const rootResult = rootCursor.advance(root)
          expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

          rootCursor.descend()
          const parentNextSibling = createNode()
          const parentNextSiblingResult = rootCursor.advance(parentNextSibling)
          expect(decodeInsertionPoint(parentNextSiblingResult)).toEqual({
            type: 'appendChild',
            parent: rootResult.nodeId,
          })

          // Create a new InsertionCursor that inserts into the root node's child list.
          const cursor = createChildInsertionCursor(rootResult.nodeId, parentNextSiblingResult.nodeId, nodeIds)

          // Create the parent node using the new InsertionCursor, inserting it as the first
          // child of the root node.
          const parent = createNode()
          const parentResult = cursor.advance(parent)
          expect(decodeInsertionPoint(parentResult)).toEqual({
            type: 'insertBefore',
            nextSibling: parentNextSiblingResult.nodeId,
          })

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
      })
    })

    it('has no effect if called at the root level', () => {
      const cursor = createRootInsertionCursor(nodeIds)
      cursor.ascend() // Should have no effect.

      // When we advance, the result should be the same as if ascend() was never called.
      const root = createNode()
      const result = cursor.advance(root)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'root' })
    })

    it('has no effect if called when within the initial child list of a child insertion cursor', () => {
      const rootCursor = createRootInsertionCursor(nodeIds)
      const root = createNode()
      const rootResult = rootCursor.advance(root)
      expect(decodeInsertionPoint(rootResult)).toEqual({ type: 'root' })

      const cursor = createChildInsertionCursor(rootResult.nodeId, undefined, nodeIds)
      cursor.ascend() // Should have no effect.

      // When we advance, the result should be the same as if ascend() was never called.
      const child = createNode()
      const result = cursor.advance(child)
      expect(decodeInsertionPoint(result)).toEqual({ type: 'appendChild', parent: rootResult.nodeId })
    })

    it('has no effect if called without a matching descend', () => {
      const cursor = createRootInsertionCursor(nodeIds)
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
