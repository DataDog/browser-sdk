import type { TimeStamp } from '@datadog/browser-core'
import type { NodePrivacyLevelCache, RumMutationRecord } from '@datadog/browser-rum-core'
import {
  isNodeShadowHost,
  getParentNode,
  forEachChildNodes,
  getNodePrivacyLevel,
  getTextContent,
  NodePrivacyLevel,
} from '@datadog/browser-rum-core'
import type { AttributeChange } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { NodeId, NodeIds } from '../itemIds'
import type { ChangeSerializationTransaction } from './serializationTransaction'
import { SerializationKind, serializeChangesInTransaction } from './serializationTransaction'
import { serializeNodeAsChange } from './serializeNodeAsChange'
import { createChildInsertionCursor } from './insertionCursor'
import { getElementInputValue } from './serializationUtils'
import { serializeAttribute } from './serializeAttribute'

export function serializeMutationsAsChange(
  timestamp: TimeStamp,
  mutations: RumMutationRecord[],
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope
): void {
  serializeChangesInTransaction(
    SerializationKind.INCREMENTAL_SNAPSHOT,
    emitRecord,
    emitStats,
    scope,
    timestamp,
    (transaction: ChangeSerializationTransaction) => processMutations(mutations, transaction)
  )
}

type AttributeName = string
type OldValue = string | null

function processMutations(mutations: RumMutationRecord[], transaction: ChangeSerializationTransaction): void {
  const addedNodes = new Set<Node>()
  const attributeMutations = new Map<Element, Map<AttributeName, OldValue>>()
  const characterDataMutations = new Map<Node, OldValue>()
  const removedNodes = new Set<Node>()

  // Collect the changes made by this sequence of mutations. It's important to think of
  // the mutations as telling us which parts of the tree are dirty, but not necessarily as
  // specifying exactly which changes have occurred; trying to be too clever will result
  // in incorrect behavior. For example, if we see a sequence of mutations where a node is
  // removed and then added back in the same position, one might be tempted to "cancel
  // out" these two changes and ignore both mutations, but that could cause us to miss
  // changes to the node that occurred while it was detached.
  for (const mutation of mutations) {
    switch (mutation.type) {
      case 'attributes': {
        const node = mutation.target
        let attributes = attributeMutations.get(node)
        if (!attributes) {
          attributes = new Map<AttributeName, OldValue>()
          attributeMutations.set(node, attributes)
        }
        const attributeName = mutation.attributeName!
        if (!attributes.has(attributeName)) {
          attributes.set(attributeName, mutation.oldValue)
        }
        break
      }

      case 'characterData':
        if (!characterDataMutations.has(mutation.target)) {
          characterDataMutations.set(mutation.target, mutation.oldValue)
        }
        break

      case 'childList':
        for (let index = 0; index < mutation.addedNodes.length; index++) {
          addedNodes.add(mutation.addedNodes[index])
        }
        for (let index = 0; index < mutation.removedNodes.length; index++) {
          removedNodes.add(mutation.removedNodes[index])
        }
        break
    }
  }

  // Before we process any mutations, snapshot the id that the next newly-added node will
  // receive. We know that any node with an id greater than or equal to this one is new
  // and will have been serialized in its entirety in processAddedNodes(), so we can skip
  // processing more fine-grained mutations for these nodes.
  const firstNewNodeId = transaction.scope.nodeIds.nextId

  // Because we process incremental mutations synchronously, we know that privacy levels
  // cannot change during the process, so we use a single, shared privacy level cache.
  const nodePrivacyLevelCache: NodePrivacyLevelCache = new Map()

  processRemovedNodes(removedNodes, transaction)
  processAddedNodes(addedNodes, nodePrivacyLevelCache, transaction)
  processCharacterDataMutations(characterDataMutations, firstNewNodeId, nodePrivacyLevelCache, transaction)
  processAttributeMutations(attributeMutations, firstNewNodeId, nodePrivacyLevelCache, transaction)
}

function processRemovedNodes(nodes: Set<Node>, transaction: ChangeSerializationTransaction): void {
  const nodeIds = transaction.scope.nodeIds

  for (const node of nodes) {
    const nodeId = nodeIds.get(node)
    if (nodeId === undefined) {
      continue // This node wasn't serialized.
    }

    forNodeAndDescendants(node, (node: Node) => {
      if (isNodeShadowHost(node)) {
        transaction.scope.shadowRootsController.removeShadowRoot(node.shadowRoot)
      }

      // Forget this node's identity. If it's added to the DOM again in another mutation,
      // we'll treat it as a new node. This reduces the number of edge cases that we need
      // to deal with; for example, changes in privacy level as a result of the different
      // ancestor chain in the new position are handled without any special effort on our
      // part.
      nodeIds.delete(node)
    })

    transaction.removeNode(nodeId)
  }
}

function processAddedNodes(
  nodes: Set<Node>,
  nodePrivacyLevelCache: NodePrivacyLevelCache,
  transaction: ChangeSerializationTransaction
): void {
  const nodeIds = transaction.scope.nodeIds

  for (const node of nodes) {
    if (!node.isConnected) {
      continue // This node is not in the DOM.
    }

    const existingNodeId = nodeIds.get(node)
    if (existingNodeId !== undefined) {
      continue // This node has already been serialized.
    }

    const parentNode = getParentNode(node)
    if (!parentNode) {
      continue // This node has no parent.
    }

    const parentId = nodeIds.get(parentNode)
    if (parentId === undefined) {
      // This node's parent hasn't been serialized (e.g. because it has privacy level
      // HIDDEN), so we shouldn't serialize this node either.
      continue
    }

    const parentNodePrivacyLevel = getNodePrivacyLevel(
      parentNode,
      transaction.scope.configuration.defaultPrivacyLevel,
      nodePrivacyLevelCache
    )

    const nextSiblingId = getNextSiblingId(node, nodeIds)

    serializeNodeAsChange(
      createChildInsertionCursor(parentId, nextSiblingId, nodeIds),
      node,
      parentNodePrivacyLevel,
      transaction
    )
  }
}

function processCharacterDataMutations(
  mutations: Map<Node, OldValue>,
  firstNewNodeId: NodeId,
  nodePrivacyLevelCache: NodePrivacyLevelCache,
  transaction: ChangeSerializationTransaction
): void {
  const nodeIds = transaction.scope.nodeIds

  for (const [node, oldValue] of mutations) {
    if (node.textContent === oldValue) {
      continue // No change since the last snapshot.
    }

    if (!node.isConnected) {
      continue // This node is not in the DOM.
    }

    const nodeId = nodeIds.get(node)
    if (nodeId === undefined) {
      continue // This node was never serialized.
    }
    if (nodeId >= firstNewNodeId) {
      // This node was just serialized, so we've already got an up-to-date copy of its
      // text content.
      continue
    }

    const parentNode = getParentNode(node)
    if (!parentNode) {
      continue // This node has no parent.
    }

    const parentNodePrivacyLevel = getNodePrivacyLevel(
      parentNode,
      transaction.scope.configuration.defaultPrivacyLevel,
      nodePrivacyLevelCache
    )
    if (parentNodePrivacyLevel === NodePrivacyLevel.HIDDEN || parentNodePrivacyLevel === NodePrivacyLevel.IGNORE) {
      continue // Mutations to this node should be ignored.
    }

    const content = getTextContent(node, parentNodePrivacyLevel) ?? ''
    transaction.setText(nodeId, content)
  }
}

function processAttributeMutations(
  mutations: Map<Element, Map<AttributeName, OldValue>>,
  firstNewNodeId: NodeId,
  nodePrivacyLevelCache: NodePrivacyLevelCache,
  transaction: ChangeSerializationTransaction
): void {
  const nodeIds = transaction.scope.nodeIds

  for (const [node, attributeNames] of mutations) {
    if (!node.isConnected) {
      continue // This node is not in the DOM.
    }

    const nodeId = nodeIds.get(node)
    if (nodeId === undefined) {
      continue // This node was never serialized.
    }
    if (nodeId >= firstNewNodeId) {
      // This node was just serialized, so we've already got an up-to-date copy of its
      // attributes.
      continue
    }

    const privacyLevel = getNodePrivacyLevel(
      node,
      transaction.scope.configuration.defaultPrivacyLevel,
      nodePrivacyLevelCache
    )
    if (privacyLevel === NodePrivacyLevel.HIDDEN || privacyLevel === NodePrivacyLevel.IGNORE) {
      continue // Mutations to this node should be ignored.
    }

    const change: AttributeChange = [nodeId]
    for (const [attributeName, oldValue] of attributeNames) {
      if (node.getAttribute(attributeName) === oldValue) {
        continue // No change since the last snapshot.
      }

      if (attributeName === 'value') {
        const attributeValue = getElementInputValue(node, privacyLevel)
        if (attributeValue !== undefined) {
          change.push([attributeName, attributeValue])
        }
        continue
      }

      const attributeValue = serializeAttribute(node, privacyLevel, attributeName, transaction.scope.configuration)
      if (attributeValue === null) {
        change.push([attributeName])
      } else {
        change.push([attributeName, attributeValue])
      }
    }

    if (change.length > 1) {
      transaction.setAttributes(change)
    }
  }
}

function getNextSiblingId(node: Node, nodeIds: NodeIds): NodeId | undefined {
  let nextSibling = node.nextSibling
  while (nextSibling) {
    const id = nodeIds.get(nextSibling)
    if (id !== undefined) {
      return id
    }
    nextSibling = nextSibling.nextSibling
  }

  return undefined
}

function forNodeAndDescendants(node: Node, action: (node: Node) => void): void {
  action(node)
  forEachChildNodes(node, (childNode) => forNodeAndDescendants(childNode, action))
}
