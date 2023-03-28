import { noop } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { NodePrivacyLevel } from '../src/constants'
import type { ShadowRootsController } from '../src/domain/record'
import type {
  BrowserFullSnapshotRecord,
  BrowserIncrementalSnapshotRecord,
  BrowserSegment,
  ElementNode,
  FrustrationRecord,
  SerializedNode,
  SerializedNodeWithId,
  TextNode,
  MetaRecord,
  MouseInteractionType,
  VisualViewportRecord,
  BrowserRecord,
} from '../src/types'
import { RecordType, IncrementalSource, NodeType } from '../src/types'

// Returns the first MetaRecord in a Segment, if any.
export function findMeta(segment: BrowserSegment): MetaRecord | null {
  return segment.records.find((record) => record.type === RecordType.Meta) as MetaRecord
}

// Returns the first FullSnapshotRecord in a Segment, if any.
export function findFullSnapshot({ records }: { records: BrowserRecord[] }): BrowserFullSnapshotRecord | null {
  return records.find((record) => record.type === RecordType.FullSnapshot) as BrowserFullSnapshotRecord
}

// Returns all the VisualViewportRecords in a Segment, if any.
export function findAllVisualViewports(segment: BrowserSegment): VisualViewportRecord[] {
  return segment.records.filter((record) => record.type === RecordType.VisualViewport) as VisualViewportRecord[]
}

// Returns the first IncrementalSnapshotRecord of a given source in a Segment, if any.
export function findIncrementalSnapshot(
  segment: BrowserSegment,
  source: IncrementalSource
): BrowserIncrementalSnapshotRecord | null {
  return segment.records.find(
    (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === source
  ) as BrowserIncrementalSnapshotRecord
}

// Returns all the IncrementalSnapshotRecord of a given source in a Segment, if any.
export function findAllIncrementalSnapshots(
  segment: BrowserSegment,
  source: IncrementalSource
): BrowserIncrementalSnapshotRecord[] {
  return segment.records.filter(
    (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === source
  ) as BrowserIncrementalSnapshotRecord[]
}

// Returns all the FrustrationRecords in the given Segment, if any.
export function findAllFrustrationRecords(segment: BrowserSegment): FrustrationRecord[] {
  return segment.records.filter((record) => record.type === RecordType.FrustrationRecord) as FrustrationRecord[]
}

// Returns all the IncrementalSnapshotRecords of the given MouseInteraction source, if any
export function findMouseInteractionRecords(
  segment: BrowserSegment,
  source: MouseInteractionType
): BrowserIncrementalSnapshotRecord[] {
  return findAllIncrementalSnapshots(segment, IncrementalSource.MouseInteraction).filter(
    (record) => 'type' in record.data && record.data.type === source
  )
}

// Returns the textContent of a ElementNode, if any.
export function findTextContent(elem: ElementNode): string | null {
  const text = elem.childNodes.find((child) => child.type === NodeType.Text) as TextNode
  return text ? text.textContent : null
}

// Returns the first ElementNode with the given ID attribute contained in a node, if any.
export function findElementWithIdAttribute(root: SerializedNodeWithId, id: string) {
  return findElement(root, (node) => node.attributes.id === id)
}

// Returns the first ElementNode with the given tag name contained in a node, if any.
export function findElementWithTagName(root: SerializedNodeWithId, tagName: string) {
  return findElement(root, (node) => node.tagName === tagName)
}

// Returns the first TextNode with the given content contained in a node, if any.
export function findTextNode(root: SerializedNodeWithId, textContent: string) {
  return findNode(root, (node) => isTextNode(node) && node.textContent === textContent) as
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

/**
 * Simplify asserting record lengths across multiple devices when not all record types are supported
 */
export const recordsPerFullSnapshot = () =>
  // Meta, Focus, FullSnapshot, VisualViewport (support limited)
  window.visualViewport ? 4 : 3

export const DEFAULT_SHADOW_ROOT_CONTROLLER: ShadowRootsController = {
  flush: noop,
  stop: noop,
  addShadowRoot: noop,
  removeShadowRoot: noop,
}

export const DEFAULT_CONFIGURATION = { defaultPrivacyLevel: NodePrivacyLevel.ALLOW } as RumConfiguration
