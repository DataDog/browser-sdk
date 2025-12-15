import { noop } from '@datadog/browser-core'
import type { DocumentNode, SerializedNodeWithId } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import type { SerializationStats, SerializationTransaction } from '../serialization'
import {
  SerializationKind,
  serializeDocument,
  serializeInTransaction,
  updateSerializationStats,
} from '../serialization'
import type { NodeId } from '../nodeIds'
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
      return transactionScope.nodeIds.assign(node)
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
