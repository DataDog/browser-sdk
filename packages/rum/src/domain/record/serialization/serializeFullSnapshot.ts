import { getScrollX, getScrollY } from '@datadog/browser-rum-core'
import type { TimeStamp } from '@datadog/browser-core'
import type { BrowserFullSnapshotRecord } from '../../../types'
import { RecordType, SnapshotFormat } from '../../../types'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import { serializeNode } from './serializeNode'
import { serializeInTransaction } from './serializationTransaction'
import type { SerializationKind, SerializationTransaction } from './serializationTransaction'

export function serializeFullSnapshot(
  timestamp: TimeStamp,
  kind: SerializationKind,
  document: Document,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope
): void {
  serializeInTransaction(kind, emitRecord, emitStats, scope, (transaction: SerializationTransaction) => {
    const defaultPrivacyLevel = transaction.scope.configuration.defaultPrivacyLevel

    // We are sure that Documents are never ignored, so this function never returns null.
    const node = serializeNode(document, defaultPrivacyLevel, transaction)!

    const record: BrowserFullSnapshotRecord = {
      data: {
        node,
        initialOffset: {
          left: getScrollX(),
          top: getScrollY(),
        },
      },
      format: SnapshotFormat.V1,
      type: RecordType.FullSnapshot,
      timestamp,
    }
    transaction.add(record)

    scope.serializeObservable.notify({
      type: 'full',
      kind,
      target: document,
      timestamp,
      v1: record,
    })
  })
}
