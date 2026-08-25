import { elapsed, timeStampNow } from '@datadog/js-core/time'
import type { TimeStamp } from '@datadog/js-core/time'
import { ChangeType, RecordType, SnapshotFormat } from '../../../types'
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
  AttributeChange,
  InputSelectionChange,
  InputSelectionState,
  InsertionPoint,
  MediaInteractionType,
  RoleAnnotatedStringLiteral,
  StringLiteral,
  StringReference,
  StyleSheetMediaList,
  StyleSheetRules,
} from '../../../types'
import type { NodeId, StyleSheetId } from '../encoding'
import { createChangeEncoder } from '../encoding'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import type { SerializationStats } from './serializationStats'
import { createSerializationStats, updateSerializationStats } from './serializationStats'

export const enum SerializationKind {
  INITIAL_FULL_SNAPSHOT,
  SUBSEQUENT_FULL_SNAPSHOT,
  INCREMENTAL_SNAPSHOT,
}

type AddNodeParams<NodeChange extends AddNodeChange> = NodeChange extends [any, any, ...infer Params] ? Params : never

/**
 * The node name of a node change. We exclude the string literal variant, since it's
 * obsolete, and the string reference variant, since only the encoder should produce it.
 */
type AddNodeName<NodeChange extends AddNodeChange> = Exclude<NodeChange[1], StringLiteral | StringReference>

/** The string literal type corresponding to a node name. */
type NodeNameOf<Name> = Name extends RoleAnnotatedStringLiteral ? Name['string'] : never

export type SerializationTransactionCallback = (transaction: SerializationTransaction) => void

/**
 * SerializationTransaction is used to build and emit a `BrowserChangeRecord` containing a
 * serialized snapshot of the DOM. The term "transaction" is used because all the changes
 * in a serialization transaction are applied together, atomically. A serialization
 * transaction is thus always associated with a single timestamp.
 *
 * To use `SerializationTransaction`, call the builder methods it exposes to add changes
 * to the transaction. At the end of the transaction, the changes will be combined into a
 * single `BrowserChangeRecord` and emitted.
 */
export interface SerializationTransaction {
  /**
   * Add a metric to the transaction's statistics. The aggregated statistics will be
   * emitted when the transaction ends.
   */
  addMetric(metric: keyof SerializationStats, value: number): void

  /** Add a node to the document at the given insertion point. */
  addNode(
    pos: InsertionPoint,
    nodeName: AddNodeName<AddCDataSectionNodeChange>,
    ...params: AddNodeParams<AddCDataSectionNodeChange>
  ): void
  addNode(
    pos: InsertionPoint,
    nodeName: AddNodeName<AddDocTypeNodeChange>,
    ...params: AddNodeParams<AddDocTypeNodeChange>
  ): void
  addNode(
    pos: InsertionPoint,
    nodeName: AddNodeName<AddDocumentNodeChange>,
    ...params: AddNodeParams<AddDocumentNodeChange>
  ): void
  addNode(
    pos: InsertionPoint,
    nodeName: AddNodeName<AddDocumentFragmentNodeChange>,
    ...params: AddNodeParams<AddDocumentFragmentNodeChange>
  ): void
  addNode(
    pos: InsertionPoint,
    nodeName: AddNodeName<AddShadowRootNodeChange>,
    ...params: AddNodeParams<AddShadowRootNodeChange>
  ): void
  addNode(
    pos: InsertionPoint,
    nodeName: AddNodeName<AddTextNodeChange>,
    ...params: AddNodeParams<AddTextNodeChange>
  ): void
  addNode<Name extends AddNodeName<AddElementNodeChange>>(
    pos: InsertionPoint,
    nodeName: Name,
    // This overload is deliberately unsatisfiable; a '#'-prefixed name belongs to one of
    // the node kinds above, so we should never reach it unless the caller provided
    // invalid parameters.
    ...params: NodeNameOf<Name> extends `#${string}` ? [never] : AddNodeParams<AddElementNodeChange>
  ): void

  /** Add a stylesheet to the document. */
  addStyleSheet(rules: StyleSheetRules, mediaList?: StyleSheetMediaList, disabled?: boolean): void

  /**
   * Attach one or more stylesheets to a <link>, <style>, #document, #document-fragment,
   * or #shadow-root node.
   */
  attachStyleSheets(nodeId: NodeId, sheetIds: StyleSheetId[]): void

  /** Remove a node from the document. */
  removeNode(nodeId: NodeId): void

  /** Set a node's attributes to the given values. */
  setAttributes(change: AttributeChange): void

  /** Set the selection state of one or more checkboxes, radio buttons, or <option> elements. */
  setInputSelection(state: InputSelectionState, nodeIds: NodeId[]): void

  /** Set the value of a form element. */
  setInputValue(nodeId: NodeId, value: RoleAnnotatedStringLiteral): void

  /** Set the media playback state of an <audio> or <video> element. */
  setMediaPlaybackState(nodeId: NodeId, state: MediaInteractionType): void

  /** Set the given node's scroll position in CSS pixels. */
  setScrollPosition(nodeId: NodeId, x: number, y: number): void

  /** Set the given node's size in CSS pixels. */
  setSize(nodeId: NodeId, width: number, height: number): void

  /** Set the given node's text content. */
  setText(nodeId: NodeId, content: RoleAnnotatedStringLiteral): void

  /** The kind of serialization being performed in this transaction. */
  kind: SerializationKind

  /** The recording scope in which this transaction is occurring. */
  scope: RecordingScope
}

export function serializeInTransaction(
  kind: SerializationKind,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope,
  timestamp: TimeStamp,
  serialize: SerializationTransactionCallback
): void {
  const encoder = createChangeEncoder(scope.stringIds)
  const stats = createSerializationStats()

  const transaction: SerializationTransaction = {
    addMetric(metric: keyof SerializationStats, value: number): void {
      updateSerializationStats(stats, metric, value)
    },
    // The overloads declared above are what callers are checked against; this implementation
    // takes the parameters of any of them.
    addNode(...change: unknown[]): void {
      encoder.add(ChangeType.AddNode, change as AddNodeChange)
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
    removeNode(nodeId: NodeId): void {
      encoder.add(ChangeType.RemoveNode, nodeId)
    },
    setAttributes(change: AttributeChange): void {
      encoder.add(ChangeType.Attribute, change)
    },
    setInputSelection(state: InputSelectionState, nodeIds: NodeId[]): void {
      const change: InputSelectionChange = [state]
      for (const nodeId of nodeIds) {
        change.push(nodeId)
      }
      encoder.add(ChangeType.InputSelection, change)
    },
    setInputValue(nodeId: NodeId, value: RoleAnnotatedStringLiteral): void {
      encoder.add(ChangeType.InputValue, [nodeId, value])
    },
    setMediaPlaybackState(nodeId: NodeId, state: MediaInteractionType): void {
      encoder.add(ChangeType.MediaPlaybackState, [nodeId, state])
    },
    setScrollPosition(nodeId: NodeId, x: number, y: number): void {
      encoder.add(ChangeType.ScrollPosition, [nodeId, x, y])
    },
    setSize(nodeId: NodeId, width: number, height: number): void {
      encoder.add(ChangeType.Size, [nodeId, width, height])
    },
    setText(nodeId: NodeId, content: RoleAnnotatedStringLiteral): void {
      encoder.add(ChangeType.Text, [nodeId, content])
    },
    kind,
    scope,
  }

  const start = timeStampNow()
  serialize(transaction)
  updateSerializationStats(stats, 'serializationDuration', elapsed(start, timeStampNow()))

  const changes = encoder.flush()
  if (changes.length > 0) {
    if (kind === SerializationKind.INITIAL_FULL_SNAPSHOT || kind === SerializationKind.SUBSEQUENT_FULL_SNAPSHOT) {
      emitRecord({
        data: changes,
        format: SnapshotFormat.Change,
        type: RecordType.FullSnapshot,
        timestamp,
      })
    } else {
      emitRecord({
        data: changes,
        type: RecordType.Change,
        timestamp,
      })
    }
  }

  emitStats(stats)
}
