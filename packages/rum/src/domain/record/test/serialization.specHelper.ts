import type { TimeStamp } from '@datadog/browser-core'
import { noop } from '@datadog/browser-core'
import { RecordType, SnapshotFormat } from '../../../types'
import type { BrowserFullSnapshotChangeRecord, BrowserRecord } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import type { ChangeSerializationTransaction, SerializationStats } from '../serialization'
import {
  createRootInsertionCursor,
  SerializationKind,
  serializeChangesInTransaction,
  serializeNodeAsChange,
  updateSerializationStats,
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
} = {}): ChangeSerializationTransaction {
  const transactionScope = scope || createRecordingScopeForTesting()
  return {
    addMetric(metric: keyof SerializationStats, value: number): void {
      if (stats) {
        updateSerializationStats(stats, metric, value)
      }
    },
    kind: kind ?? SerializationKind.INITIAL_FULL_SNAPSHOT,
    scope: transactionScope,
  } as ChangeSerializationTransaction
}

export function takeFullSnapshotForTesting(scope: RecordingScope): BrowserFullSnapshotChangeRecord {
  let fullSnapshotRecord: BrowserFullSnapshotChangeRecord | undefined
  const emitRecord = (record: BrowserRecord) => {
    if (record.type !== RecordType.FullSnapshot || record.format !== SnapshotFormat.Change) {
      throw new Error('Full snapshot has unexpected format')
    }
    fullSnapshotRecord = record
  }

  serializeChangesInTransaction(
    SerializationKind.INITIAL_FULL_SNAPSHOT,
    emitRecord,
    noop,
    scope,
    0 as TimeStamp,
    (transaction: ChangeSerializationTransaction) => {
      const insertionCursor = createRootInsertionCursor(scope.nodeIds)
      const defaultPrivacyLevel = transaction.scope.configuration.defaultPrivacyLevel
      serializeNodeAsChange(insertionCursor, document, defaultPrivacyLevel, transaction)
    }
  )

  if (!fullSnapshotRecord) {
    throw new Error('No full snapshot was generated')
  }

  return fullSnapshotRecord
}
