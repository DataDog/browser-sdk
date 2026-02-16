import type { InsertionPoint } from '../../../types'
import type { NodeId, NodeIds } from '../itemIds'

/**
 * InsertionCursor tracks the point at which the next node will be inserted during
 * Change-style DOM serialization.
 *
 * When a new node is added to the document, we use an InsertionPoint to encode its
 * position. There are often multiple equally-valid ways to express the same insertion
 * point; we generally want to favor encodings that use as few characters as possible (to
 * reduce uncompressed size) and that are as repetitive as possible (to reduce compressed
 * size). InsertionCursor's purpose is to heuristically pick an efficient encoding based
 * on the nodes we've recently serialized, while doing as little work as possible. The
 * results are not optimal, but should be close to it in most situations.
 *
 * At the beginning of the serialization process, use a factory function like
 * createRootInsertionCursor() to create a new cursor with an appropriate initial
 * position.
 *
 * When visiting a node, the expected usage pattern is as follows:
 * 1. Call advance() to get a node id and insertion point for the node.
 * 2. Serialize the node.
 * 3. If the node has no children, we're done; continue to the node's next
 * sibling and apply this algorithm again.
 * 4. Otherwise, call descend() to move the cursor into the node's child list.
 * 5. Recursively apply this algorithm.
 * 6. Call ascend() to move the cursor out of the node's child list. We're done;
 * continue to the node's next sibling and apply this algorithm again.
 */
export interface InsertionCursor {
  /**
   * Given the node id for a new node, returns the InsertionPoint for that node.
   * Updates the cursor to point to the new node's next sibling.
   */
  advance(node: Node): { nodeId: NodeId; insertionPoint: InsertionPoint }

  /**
   * Ascends out of the current child list and updates the cursor to point to the parent
   * node's next sibling.
   */
  ascend(): void

  /**
   * Descends into the child list of the last node we inserted and updates the cursor to
   * point to the node's first child.
   */
  descend(): void
}

/** Returns an InsertionCursor which starts positioned at the root of the document. */
export function createRootInsertionCursor(nodeIds: NodeIds): InsertionCursor {
  return createInsertionCursor(undefined, undefined, nodeIds)
}

/**
 * Returns an InsertionCursor which starts positioned in the child list of the given
 * parent node. If a next sibling is provided, the cursor points to the position
 * immediately before the next sibling; otherwise, the cursor points to the end of the
 * child list.
 */
export function createChildInsertionCursor(
  parentId: NodeId,
  nextSiblingId: NodeId | undefined,
  nodeIds: NodeIds
): InsertionCursor {
  return createInsertionCursor(parentId, nextSiblingId, nodeIds)
}

function createInsertionCursor(
  parentId: NodeId | undefined,
  nextSiblingId: NodeId | undefined,
  nodeIds: NodeIds
): InsertionCursor {
  interface ChildListCursor {
    container: ChildListCursor | undefined
    parentId: NodeId | undefined
    previousSiblingId: NodeId | undefined
    nextSiblingId: NodeId | undefined
  }

  let cursor: ChildListCursor = {
    container: undefined,
    parentId,
    previousSiblingId: undefined,
    nextSiblingId,
  }

  const computeInsertionPoint = (nodeId: NodeId): InsertionPoint => {
    if (cursor.previousSiblingId === nodeId - 1) {
      // Use an AppendAfterPreviousInsertionPoint. (i.e., 0)
      return 0
    }
    if (cursor.nextSiblingId !== undefined) {
      // Use an InsertBeforeInsertionPoint. We identify the next sibling using a
      // negative integer indicating the difference between the new node's id and its next
      // sibling's id.
      return cursor.nextSiblingId - nodeId
    }
    if (cursor.parentId !== undefined) {
      // Use an AppendChildInsertionPoint. We identify the parent node using a positive
      // integer indicating the difference between the new node's id and its parent's id.
      return nodeId - cursor.parentId
    }
    // There's no parent. Use a RootInsertionPoint. (i.e., null)
    return null
  }

  return {
    advance(node: Node): { nodeId: NodeId; insertionPoint: InsertionPoint } {
      const nodeId = nodeIds.getOrInsert(node)
      const insertionPoint = computeInsertionPoint(nodeId)
      cursor.previousSiblingId = nodeId
      return { nodeId, insertionPoint }
    },
    ascend(): void {
      if (cursor.container) {
        cursor = cursor.container
      }
    },
    descend(): void {
      if (cursor.previousSiblingId !== undefined) {
        cursor = {
          container: cursor,
          parentId: cursor.previousSiblingId,
          previousSiblingId: undefined,
          nextSiblingId: undefined,
        }
      }
    },
  }
}
