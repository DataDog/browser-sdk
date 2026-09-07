import { timeStampNow } from '@datadog/js-core/time'
import type { TimeStamp } from '@datadog/js-core/time'
import { StringRole } from '../../../types'
import { createString } from '../encoding'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import { SerializationKind, serializeInTransaction } from '../serialization'
import type { CanvasCapture } from '../trackers'

export function serializeCanvasImageContent(
  capture: CanvasCapture,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope,
  timestamp: TimeStamp = timeStampNow()
): void {
  serializeInTransaction(
    SerializationKind.INCREMENTAL_SNAPSHOT,
    emitRecord,
    emitStats,
    scope,
    timestamp,
    (transaction) => {
      transaction.setImageContent(capture.nodeId, createString(StringRole.ResourceId, capture.changeHash))
    }
  )
}
