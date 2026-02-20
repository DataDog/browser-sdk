import type { TimeStamp } from '@datadog/browser-core'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import { serializeChangesInTransaction } from './serializationTransaction'
import type { ChangeSerializationTransaction, SerializationKind } from './serializationTransaction'
import { serializeNodeAsChange } from './serializeNodeAsChange'
import { createRootInsertionCursor } from './insertionCursor'

export function serializeFullSnapshotAsChange(
  timestamp: TimeStamp,
  kind: SerializationKind,
  document: Document,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope
): void {
  scope.resetIds()
  serializeChangesInTransaction(
    kind,
    emitRecord,
    emitStats,
    scope,
    timestamp,
    (transaction: ChangeSerializationTransaction) => {
      serializeNodeAsChange(
        createRootInsertionCursor(scope.nodeIds),
        document,
        scope.configuration.defaultPrivacyLevel,
        transaction
      )
    }
  )
}
