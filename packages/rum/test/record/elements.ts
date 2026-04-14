import type {
  AddElementNodeChange,
  AddNodeChange,
  BrowserFullSnapshotChangeRecord,
  BrowserFullSnapshotRecord,
  BrowserFullSnapshotV1Record,
  ScrollPositionChange,
  SerializedNodeWithId,
} from '../../src/types'
import { ChangeType, NodeType, SnapshotFormat } from '../../src/types'
import { decodeFullSnapshotChangeRecord } from './changes'

/**
 * Given a full snapshot, locates elements with HTML id attributes and returns a map from
 * each id attribute value to the corresponding element's node id.
 */
export function getElementIdsFromFullSnapshot(record: BrowserFullSnapshotRecord): Map<string, number> {
  if (record.format === SnapshotFormat.Change) {
    return getElementIdsFromFullSnapshotChange(record)
  }
  return getElementIdsFromFullSnapshotV1(record)
}

function getElementIdsFromFullSnapshotChange(rawRecord: BrowserFullSnapshotChangeRecord): Map<string, number> {
  const elementIds = new Map<string, number>()

  let nextId = 0
  for (const change of decodeFullSnapshotChangeRecord(rawRecord).data) {
    if (change[0] !== ChangeType.AddNode) {
      continue
    }

    for (let i = 1; i < change.length; i++) {
      const id = nextId++
      const addedNode = change[i] as AddNodeChange
      const nodeName = addedNode[1]

      switch (nodeName) {
        case '#cdata-section':
        case '#doctype':
        case '#document':
        case '#document-fragment':
        case '#shadow-root':
        case '#text':
          continue

        default: {
          const [, , ...attributeAssignments] = addedNode as AddElementNodeChange
          for (const [name, value] of attributeAssignments) {
            if (name === 'id') {
              elementIds.set(String(value), id)
            }
          }
        }
      }
    }
  }

  return elementIds
}

function getElementIdsFromFullSnapshotV1(record: BrowserFullSnapshotV1Record): Map<string, number> {
  const elementIds = new Map<string, number>()

  const collectIds = (node: SerializedNodeWithId) => {
    if (node.type === NodeType.Element && node.attributes.id) {
      elementIds.set(String(node.attributes.id), node.id)
    }

    if ('childNodes' in node) {
      for (const child of node.childNodes) {
        collectIds(child)
      }
    }
  }

  collectIds(record.data.node)
  return elementIds
}

export interface ScrollPosition {
  left: number
  top: number
}

/**
 * Given a full snapshot, locates elements with non-zero scroll positions and returns a
 * map from each node id to the corresponding element's scroll position.
 */
export function getScrollPositionsFromFullSnapshot(record: BrowserFullSnapshotRecord): Map<number, ScrollPosition> {
  if (record.format === SnapshotFormat.Change) {
    return getScrollPositionsFromFullSnapshotChange(record)
  }
  return getScrollPositionsFromFullSnapshotV1(record)
}

function getScrollPositionsFromFullSnapshotChange(
  record: BrowserFullSnapshotChangeRecord
): Map<number, ScrollPosition> {
  const scrollPositions = new Map<number, ScrollPosition>()

  for (const change of record.data) {
    if (change[0] !== ChangeType.ScrollPosition) {
      continue
    }

    for (let i = 1; i < change.length; i++) {
      const [nodeId, left, top] = change[i] as ScrollPositionChange
      scrollPositions.set(nodeId, { left, top })
    }
  }

  return scrollPositions
}

function getScrollPositionsFromFullSnapshotV1(record: BrowserFullSnapshotV1Record): Map<number, ScrollPosition> {
  const scrollPositions = new Map<number, ScrollPosition>()

  const collectScrollPositions = (node: SerializedNodeWithId) => {
    if (node.type === NodeType.Element && (node.attributes.rr_scrollLeft || node.attributes.rr_scrollTop)) {
      const left = node.attributes.rr_scrollLeft ?? 0
      const top = node.attributes.rr_scrollTop ?? 0
      scrollPositions.set(node.id, { left: Number(left), top: Number(top) })
    }

    if ('childNodes' in node) {
      for (const child of node.childNodes) {
        collectScrollPositions(child)
      }
    }
  }

  collectScrollPositions(record.data.node)
  return scrollPositions
}
