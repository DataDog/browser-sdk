import { noop, timeStampNow } from '@datadog/browser-core'
import { RecordType } from '../../../types'
import type {
  BrowserChangeRecord,
  BrowserFullSnapshotRecord,
  BrowserRecord,
  DocumentNode,
  ElementNode,
  SerializedNodeWithId,
} from '../../../types'
import type { NodeId } from '../itemIds'
import type { RecordingScope } from '../recordingScope'
import type {
  ChangeSerializationTransaction,
  ParentNodePrivacyLevel,
  SerializationStats,
  SerializationTransaction,
} from '../serialization'
import {
  serializeNode,
  SerializationKind,
  serializeDocument,
  serializeInTransaction,
  updateSerializationStats,
  serializeChangesInTransaction,
  createRootInsertionCursor,
  serializeNodeAsChange,
  createChangeConverter,
} from '../serialization'
import { createRecordingScopeForTesting } from './recordingScope.specHelper'

export function createSerializationTransactionForTesting({
  kind,
  scope,
  stats,
}: {
  kind?: SerializationKind
  scope?: RecordingScope
  stats?: SerializationStats
} = {}): SerializationTransaction {
  const transactionScope = scope || createRecordingScopeForTesting()
  return {
    add(): void {
      throw new Error('Use serializeInTransaction normally to test code that generates BrowserRecords.')
    },
    addMetric(metric: keyof SerializationStats, value: number): void {
      if (stats) {
        updateSerializationStats(stats, metric, value)
      }
    },
    assignId(node: Node): NodeId {
      return transactionScope.nodeIds.getOrInsert(node)
    },
    kind: kind ?? SerializationKind.INITIAL_FULL_SNAPSHOT,
    scope: transactionScope,
  }
}

export function takeFullSnapshotForTesting(scope: RecordingScope): DocumentNode & SerializedNodeWithId {
  let node: (DocumentNode & SerializedNodeWithId) | null

  serializeInTransaction(
    SerializationKind.INITIAL_FULL_SNAPSHOT,
    noop,
    noop,
    scope,
    (transaction: SerializationTransaction): void => {
      // Tests want to assert against the serialized node representation of the document,
      // not the record that would contain it if we emitted it, so don't bother emitting.
      node = serializeDocument(document, transaction)
    }
  )

  return node!
}

/**
 * A drop-in replacement for serializeNode() that verifies that serializeNodeAsChange()
 * produces an identical result, failing the running test if it does not.
 */
export function serializeNodeAndVerifyChangeRecord(
  node: Element,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): (SerializedNodeWithId & ElementNode) | null
export function serializeNodeAndVerifyChangeRecord(
  node: Node,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): SerializedNodeWithId | null
export function serializeNodeAndVerifyChangeRecord(
  node: Node,
  parentNodePrivacyLevel: ParentNodePrivacyLevel,
  transaction: SerializationTransaction
): SerializedNodeWithId | null {
  const serializedNode = serializeNode(node, parentNodePrivacyLevel, transaction)

  // Create an isolated recording scope for calling serializeNodeAsChange(). We do need to
  // share the ElementsScrollPositions value, because some serialization tests manually
  // manipulate its contents.
  const changeScope = createRecordingScopeForTesting()
  changeScope.elementsScrollPositions = transaction.scope.elementsScrollPositions

  let changeRecord: BrowserChangeRecord | undefined
  serializeChangesInTransaction(
    transaction.kind,
    (record: BrowserRecord): void => {
      if (record.type !== RecordType.Change) {
        throw new Error(`Received unexpected record type: ${record.type}`)
      }
      changeRecord = record
    },
    noop,
    changeScope,
    timeStampNow(),
    (transaction: ChangeSerializationTransaction) => {
      const cursor = createRootInsertionCursor(changeScope.nodeIds)
      serializeNodeAsChange(cursor, node, parentNodePrivacyLevel, transaction)
    }
  )

  if (serializedNode === null) {
    // If serializeNode() didn't serialize anything, neither should
    // serializeNodeAsChange().
    expect(changeRecord).toBeUndefined()
  } else {
    // When converted to a FullSnapshot record, serializeNodeAsChange()'s output should
    // match serializeNode() exactly.
    expect(changeRecord).not.toBeUndefined()
    const converter = createChangeConverter()
    const convertedRecord = converter.convert(changeRecord!) as BrowserFullSnapshotRecord
    const convertedNode = convertedRecord.data.node
    expect(convertedNode).toEqual(serializedNode)

    // When stringified, serializeNodeAsChange()'s converted output should be
    // byte-for-byte identical to serializeNode()'s. (This test is stricter than the one
    // above, but produces error messages which are a lot harder to read, so it's worth
    // having both.)
    expect(JSON.stringify(convertedNode)).toEqual(JSON.stringify(serializedNode))
  }

  return serializedNode
}
