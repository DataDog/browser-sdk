import type { TimeStamp } from '@datadog/js-core/time'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import { serializeInTransaction } from './serializationTransaction'
import type { SerializationTransaction, SerializationKind } from './serializationTransaction'
import { serializeNode } from './serializeNode'
import { createRootInsertionCursor } from './insertionCursor'

export function serializeFullSnapshot(
  timestamp: TimeStamp,
  kind: SerializationKind,
  document: Document,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope
): void {
  scope.resetIds()
  serializeInTransaction(kind, emitRecord, emitStats, scope, timestamp, (transaction: SerializationTransaction) => {
    serializeNode(
      createRootInsertionCursor(scope.nodeIds),
      document,
      scope.configuration.defaultPrivacyLevel,
      transaction
    )
  })
}
