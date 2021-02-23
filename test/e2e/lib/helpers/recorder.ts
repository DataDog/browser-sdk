import {
  NodeType,
  SerializedNode,
  ElementNode,
  TextNode,
  SerializedNodeWithId,
} from '@datadog/browser-rum-recorder/cjs/domain/rrweb-snapshot/types'
import {
  Segment,
  RecordType,
  FullSnapshotRecord,
  MetaRecord,
  IncrementalSnapshotRecord,
  IncrementalSource,
  MutationData,
} from '@datadog/browser-rum-recorder/cjs/types'
import { EventRegistry } from '../framework'

// Returns this first MetaRecord in a Segment, if any.
export function findMeta(segment: Segment): MetaRecord | null {
  return segment.records.find((record) => record.type === RecordType.Meta) as MetaRecord
}

// Returns this first FullSnapshotRecord in a Segment, if any.
export function findFullSnapshot(segment: Segment): FullSnapshotRecord | null {
  return segment.records.find((record) => record.type === RecordType.FullSnapshot) as FullSnapshotRecord
}

// Returns the first IncrementalSnapshotRecord of a given source in a
// Segment, if any.
export function findIncrementalSnapshot(segment: Segment, source: IncrementalSource): IncrementalSnapshotRecord | null {
  return segment.records.find(
    (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === source
  ) as IncrementalSnapshotRecord
}

// Returns all the IncrementalSnapshotRecord of a given source in a
// Segment, if any.
export function findAllIncrementalSnapshots(segment: Segment, source: IncrementalSource): IncrementalSnapshotRecord[] {
  return segment.records.filter(
    (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === source
  ) as IncrementalSnapshotRecord[]
}

// Returns the textContent of a ElementNode, if any.
export function findTextContent(elem: ElementNode): string | null {
  const text = elem.childNodes.find((child) => child.type === NodeType.Text) as TextNode
  return text ? text.textContent : null
}

// Returns the first ElementNode with the given ID attribute from a FullSnapshotRecord, if any.
export function findElementWithIdAttribute(fullSnapshot: FullSnapshotRecord, id: string) {
  return findElement(fullSnapshot.data.node, (node) => node.attributes.id === id)
}

// Returns the first ElementNode with the given tag name from a FullSnapshotRecord, if any.
export function findElementWithTagName(fullSnapshot: FullSnapshotRecord, tagName: string) {
  return findElement(fullSnapshot.data.node, (node) => node.tagName === tagName)
}

// Returns the first TextNode with the given content from a FullSnapshotRecord, if any.
export function findTextNode(fullSnapshot: FullSnapshotRecord, textContent: string) {
  return findNode(fullSnapshot.data.node, (node) => isTextNode(node) && node.textContent === textContent) as
    | (TextNode & { id: number })
    | null
}

// Returns the first ElementNode matching the predicate
export function findElement(root: SerializedNodeWithId, predicate: (node: ElementNode) => boolean) {
  return findNode(root, (node) => isElementNode(node) && predicate(node)) as (ElementNode & { id: number }) | null
}

// Returns the first SerializedNodeWithId matching the predicate
export function findNode(
  node: SerializedNodeWithId,
  predicate: (node: SerializedNodeWithId) => boolean
): SerializedNodeWithId | null {
  if (predicate(node)) {
    return node
  }

  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      const node = findNode(child, predicate)
      if (node !== null) {
        return node
      }
    }
  }
  return null
}

function isElementNode(node: SerializedNode): node is ElementNode {
  return node.type === NodeType.Element
}

function isTextNode(node: SerializedNode): node is TextNode {
  return node.type === NodeType.Text
}

interface NodeSelector {
  // Select the first node with the given tag name from the initial full snapshot
  tag?: string
  // Select the first node with the given id attribute from the initial full snapshot
  idAttribute?: string
  // Select the first node with the given text content from the initial full snapshot
  text?: string
  // Select a node created by a previous 'AddedNodeMutation' (0 being the first node created, 1 the
  // second one, etc.)
  created?: number
}

interface ExpectedTextMutation {
  // Reference to the node where the mutation happens
  node: NodeSelector
  // New text value
  value: string
}

interface ExpectedAttributeMutation {
  // Reference to the node where the mutation happens
  node: NodeSelector
  // Updated attributes
  attributes: {
    [key: string]: string | null
  }
}

interface ExpectedRemoveMutation {
  // Reference to the removed node
  node: NodeSelector
  // Reference to the parent of the removed node
  parent: NodeSelector
}

interface ExpectedAddMutation {
  // Partially check for the added node properties. The 'id' is always checked automatically. If
  // 'from' is specified, it will base the assertion on a node from the initial full snapshot or a
  // previously created node. Else, it will consider this node as a newly created node.
  node: { from?: NodeSelector } & Partial<SerializedNode>
  // Reference to the parent of the added node
  parent: NodeSelector
  // Reference to the sibling of the added node
  next?: NodeSelector
}

/**
 * Validate the first and only mutation record of a segment against the expected text, attribute,
 * add and remove mutations.
 */
export function validateMutations(
  events: EventRegistry,
  expected: {
    texts?: ExpectedTextMutation[]
    attributes?: ExpectedAttributeMutation[]
    removes?: ExpectedRemoveMutation[]
    adds?: ExpectedAddMutation[]
  }
) {
  expect(events.sessionReplay.length).toBe(1)
  const segment = events.sessionReplay[0].segment.data
  const fullSnapshot = findFullSnapshot(segment)!

  const mutations = findAllIncrementalSnapshots(segment, IncrementalSource.Mutation) as Array<{
    data: MutationData
  }>

  expect(mutations.length).toBe(1)

  const createdNodes: SerializedNodeWithId[] = []
  const maxNodeIdFromFullSnapshot = findMaxNodeId(fullSnapshot.data.node)
  expect(mutations[0].data.adds).toEqual(
    (expected.adds || []).map(({ node: { from, ...partialNode }, parent, next }, index) => {
      let expectedNode: SerializedNodeWithId | jasmine.ObjectContaining<Partial<SerializedNodeWithId>>

      if (from) {
        // Add a previously created node
        expectedNode = { ...selectNode(from), ...partialNode } as SerializedNodeWithId
      } else {
        // Add a new node
        expectedNode = jasmine.objectContaining<Partial<SerializedNodeWithId>>({
          ...partialNode,
          id: maxNodeIdFromFullSnapshot + createdNodes.length + 1,
        })
        // Register the newly created node for future reference
        createdNodes.push(mutations[0].data.adds[index].node)
      }

      return {
        node: expectedNode,
        parentId: selectNode(parent).id,
        nextId: next ? selectNode(next).id : null,
      }
    })
  )
  expect(mutations[0].data.texts).toEqual(
    (expected.texts || []).map(({ node, value }) => ({ id: selectNode(node).id, value }))
  )
  expect(mutations[0].data.removes).toEqual(
    (expected.removes || []).map(({ node, parent }) => ({
      id: selectNode(node).id,
      parentId: selectNode(parent).id,
    }))
  )
  expect(mutations[0].data.attributes).toEqual(
    (expected.attributes || []).map(({ node, attributes }) => ({
      id: selectNode(node).id,
      attributes,
    }))
  )

  function selectNode(selector: NodeSelector) {
    let node
    if (selector.text) {
      node = findTextNode(fullSnapshot, selector.text)
    } else if (selector.idAttribute) {
      node = findElementWithIdAttribute(fullSnapshot, selector.idAttribute)
    } else if (selector.tag) {
      node = findElementWithTagName(fullSnapshot, selector.tag)
    } else if (selector.created !== undefined) {
      node = createdNodes[selector.created]
    } else {
      throw new Error('Empty selector')
    }

    if (!node) {
      throw new Error(`Cannot find node from selector ${JSON.stringify(selector)}`)
    }

    return node
  }

  function findMaxNodeId(root: SerializedNodeWithId): number {
    if ('childNodes' in root) {
      return Math.max(root.id, ...root.childNodes.map((child) => findMaxNodeId(child)))
    }

    return root.id
  }
}
