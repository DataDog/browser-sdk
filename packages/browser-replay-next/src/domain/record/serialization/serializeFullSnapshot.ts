import type { BrowserFullSnapshotRecord } from '../../../types'
import { RecordType, SnapshotFormat } from '../../../types'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import { serializeNode } from './serializeNode'
import { serializeInTransaction } from './serializationTransaction'
import type { SerializationKind, SerializationTransaction, TimeStamp } from './serializationTransaction'

// Inlined from @datadog/browser-rum-core
function getScrollX(): number {
  let scrollX
  const visual = window.visualViewport
  if (visual) {
    scrollX = visual.pageLeft - visual.offsetLeft
  } else if (window.scrollX !== undefined) {
    scrollX = window.scrollX
  } else {
    scrollX = window.pageXOffset || 0
  }
  return Math.round(scrollX)
}

function getScrollY(): number {
  let scrollY
  const visual = window.visualViewport
  if (visual) {
    scrollY = visual.pageTop - visual.offsetTop
  } else if (window.scrollY !== undefined) {
    scrollY = window.scrollY
  } else {
    scrollY = window.pageYOffset || 0
  }
  return Math.round(scrollY)
}

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
