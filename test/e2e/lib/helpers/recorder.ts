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
} from '@datadog/browser-rum-recorder/cjs/types'

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
