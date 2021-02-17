import {
  NodeType,
  SerializedNode,
  DocumentNode,
  ElementNode,
  TextNode,
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

// Retrns the textContent of a ElementNode, if any.
export function findTextContent(elem: ElementNode): string | null {
  const text = elem.childNodes.find((child) => child.type === NodeType.Text) as TextNode
  return text ? text.textContent : null
}

// Returns the first ElementNode with the given ID from a
// FullSnapshotRecord, if any.
export function findNodeWithId(fullSnapshot: FullSnapshotRecord, id: string): ElementNode | null {
  return recFindNodeWithId(fullSnapshot.data.node as DocumentNode, id)
}

function isElementNode(node: SerializedNode): node is ElementNode {
  return node.type === NodeType.Element
}

function recFindNodeWithId(node: DocumentNode | ElementNode | null, id: string): ElementNode | null {
  if (node === null) {
    return null
  }

  if (isElementNode(node) && node.attributes.id === id) {
    return node
  }

  for (const child of node.childNodes) {
    if (!isElementNode(child)) {
      continue
    }

    const node = recFindNodeWithId(child, id)
    if (node !== null) {
      return node
    }
  }

  return null
}
