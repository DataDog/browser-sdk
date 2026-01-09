import type { TimeStamp } from '@datadog/browser-core'
import { elapsed, timeStampNow } from '@datadog/browser-core'

import { ChangeType, RecordType } from '../../../types'
import type {
  AddCDataSectionNodeChange,
  AddDocTypeNodeChange,
  AddDocumentFragmentNodeChange,
  AddDocumentNodeChange,
  AddElementNodeChange,
  AddNodeChange,
  AddShadowRootNodeChange,
  AddTextNodeChange,
  AttachedStyleSheetsChange,
  BrowserRecord,
  InsertionPoint,
  MediaInteractionType,
  StyleSheetMediaList,
  StyleSheetRules,
} from '../../../types'
import type { NodeId, StyleSheetId } from '../itemIds'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import type { SerializationStats } from './serializationStats'
import { createSerializationStats, updateSerializationStats } from './serializationStats'
import { createChangeEncoder } from './changeEncoder'

export type SerializationTransactionCallback = (transaction: SerializationTransaction) => void

export const enum SerializationKind {
  INITIAL_FULL_SNAPSHOT,
  SUBSEQUENT_FULL_SNAPSHOT,
  INCREMENTAL_SNAPSHOT,
}

/**
 * A serialization transaction is used to build and emit a sequence of session replay
 * records containing a serialized snapshot of the DOM.
 */
export interface SerializationTransaction {
  /** Add a record to the transaction. It will be emitted when the transaction ends. */
  add(record: BrowserRecord): void

  /**
   * Add a metric to the transaction's statistics. The aggregated statistics will be
   * emitted when the transaction ends.
   */
  addMetric(metric: keyof SerializationStats, value: number): void

  /**
   * Assign and return an id to the given node. If the node has previously been assigned
   * an id, the existing id will be reused.
   */
  assignId(node: Node): NodeId

  /** The kind of serialization being performed in this transaction. */
  kind: SerializationKind

  /**
   * A set used to track nodes which have been serialized in the current transaction. If
   * undefined, this feature is disabled; this is the default state in new transactions
   * for performance reasons. Set the property to a non-undefined value if you need this
   * capability.
   */
  serializedNodeIds?: Set<NodeId>

  /** The recording scope in which this transaction is occurring. */
  scope: RecordingScope
}

/**
 * Perform serialization within a transaction. At the end of the transaction, the
 * generated records and statistics will be emitted.
 */
export function serializeInTransaction(
  kind: SerializationKind,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope,
  serialize: SerializationTransactionCallback
): void {
  const records: BrowserRecord[] = []
  const stats = createSerializationStats()

  const transaction: SerializationTransaction = {
    add(record: BrowserRecord): void {
      records.push(record)
    },
    addMetric(metric: keyof SerializationStats, value: number): void {
      updateSerializationStats(stats, metric, value)
    },
    assignId(node: Node): NodeId {
      const id = scope.nodeIds.getOrInsert(node)
      if (transaction.serializedNodeIds) {
        transaction.serializedNodeIds.add(id)
      }
      return id
    },
    kind,
    scope,
  }

  const start = timeStampNow()
  serialize(transaction)
  updateSerializationStats(stats, 'serializationDuration', elapsed(start, timeStampNow()))

  for (const record of records) {
    emitRecord(record)
  }

  emitStats(stats)
}

type AddNodeParams<NodeChange extends AddNodeChange> = NodeChange extends [any, any, ...infer Params] ? Params : never

export type ChangeSerializationTransactionCallback = (transaction: ChangeSerializationTransaction) => void

/**
 * ChangeSerializationTransaction is used to build and emit a BrowserChangeRecord
 * containing a serialized snapshot of the DOM. Unlike SerializationTransaction, it
 * doesn't support emitting arbitrary BrowserRecords; instead, the builder methods it
 * exposes are used to construct a single BrowserChangeRecord which is emitted at the end
 * of the transaction.
 */
export interface ChangeSerializationTransaction {
  /**
   * Add a metric to the transaction's statistics. The aggregated statistics will be
   * emitted when the transaction ends.
   */
  addMetric(metric: keyof SerializationStats, value: number): void

  /** Add a node to the document at the given insertion point. */
  addNode(pos: InsertionPoint, nodeName: '#cdata-section', ...params: AddNodeParams<AddCDataSectionNodeChange>): void
  addNode(pos: InsertionPoint, nodeName: '#doctype', ...params: AddNodeParams<AddDocTypeNodeChange>): void
  addNode(pos: InsertionPoint, nodeName: '#document', ...params: AddNodeParams<AddDocumentNodeChange>): void
  addNode(
    pos: InsertionPoint,
    nodeName: '#document-fragment',
    ...params: AddNodeParams<AddDocumentFragmentNodeChange>
  ): void
  addNode(pos: InsertionPoint, nodeName: '#shadow-root', ...params: AddNodeParams<AddShadowRootNodeChange>): void
  addNode(pos: InsertionPoint, nodeName: '#text', ...params: AddNodeParams<AddTextNodeChange>): void
  addNode(
    pos: InsertionPoint,
    nodeName: Exclude<string, `#${string}`>,
    ...params: AddNodeParams<AddElementNodeChange>
  ): void
  addNode(pos: InsertionPoint, nodeName: string, ...params: AddNodeParams<AddNodeChange>): void

  /** Add a stylesheet to the document. */
  addStyleSheet(rules: StyleSheetRules, mediaList?: StyleSheetMediaList, disabled?: boolean): void

  /**
   * Attach one or more stylesheets to a <link>, <style>, #document, #document-fragment,
   * or #shadow-root node.
   */
  attachStyleSheets(nodeId: NodeId, sheetIds: StyleSheetId[]): void

  /** Set the media playback state of an <audio> or <video> element. */
  setMediaPlaybackState(nodeId: NodeId, state: MediaInteractionType): void

  /** Set the given node's scroll position in CSS pixels. */
  setScrollPosition(nodeId: NodeId, x: number, y: number): void

  /** Set the given node's size in CSS pixels. */
  setSize(nodeId: NodeId, width: number, height: number): void

  /** The kind of serialization being performed in this transaction. */
  kind: SerializationKind

  /** The recording scope in which this transaction is occurring. */
  scope: RecordingScope
}

export function serializeChangesInTransaction(
  kind: SerializationKind,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope,
  timestamp: TimeStamp,
  serialize: ChangeSerializationTransactionCallback
): void {
  const encoder = createChangeEncoder(scope.stringIds)
  const stats = createSerializationStats()

  const transaction: ChangeSerializationTransaction = {
    addMetric(metric: keyof SerializationStats, value: number): void {
      updateSerializationStats(stats, metric, value)
    },
    addNode(pos, nodeName, ...params): void {
      const change: AddNodeChange = [pos, nodeName]
      for (const param of params) {
        change.push(param as AddNodeParams<AddNodeChange>[number])
      }
      encoder.add(ChangeType.AddNode, change)
    },
    addStyleSheet(rules: StyleSheetRules, mediaList?: StyleSheetMediaList, disabled?: boolean): void {
      if (disabled) {
        encoder.add(ChangeType.AddStyleSheet, [rules, mediaList || [], disabled])
      } else if (mediaList) {
        encoder.add(ChangeType.AddStyleSheet, [rules, mediaList])
      } else {
        encoder.add(ChangeType.AddStyleSheet, [rules])
      }
    },
    attachStyleSheets(nodeId: NodeId, sheetIds: StyleSheetId[]): void {
      const change: AttachedStyleSheetsChange = [nodeId]
      for (const sheetId of sheetIds) {
        change.push(sheetId)
      }
      encoder.add(ChangeType.AttachedStyleSheets, change)
    },
    setMediaPlaybackState(nodeId: NodeId, state: MediaInteractionType): void {
      encoder.add(ChangeType.MediaPlaybackState, [nodeId, state])
    },
    setScrollPosition(nodeId: NodeId, x: number, y: number) {
      encoder.add(ChangeType.ScrollPosition, [nodeId, x, y])
    },
    setSize(nodeId: NodeId, width: number, height: number) {
      encoder.add(ChangeType.Size, [nodeId, width, height])
    },
    kind,
    scope,
  }

  const start = timeStampNow()
  serialize(transaction)
  updateSerializationStats(stats, 'serializationDuration', elapsed(start, timeStampNow()))

  const changes = encoder.flush()
  if (changes.length > 0) {
    emitRecord({
      data: changes,
      type: RecordType.Change,
      timestamp,
    })
  }

  emitStats(stats)
}
