import { RecordType } from '../../types'
import {
  isFullSnapshotChangeRecordsEnabled,
  SerializationKind,
  serializeFullSnapshotAsChange,
  serializeFullSnapshot,
} from './serialization'
import { getVisualViewport } from './viewports'
import type { RecordingScope } from './recordingScope'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'
import { getViewportDimension, timeStampNow, type TimeStamp } from './trackers/domUtils'

export type SerializeFullSnapshotCallback = (
  timestamp: TimeStamp,
  kind: SerializationKind,
  document: Document,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope
) => void

/**
 * Emits an initial full snapshot immediately. In v8, the recorder does not use LifeCycle events
 * for subsequent snapshots — the consumer calls `takeSnapshot()` directly when a new view starts.
 */
export function startFullSnapshots(
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  flushMutations: () => void,
  scope: RecordingScope,
  serialize: SerializeFullSnapshotCallback = defaultSerializeFullSnapshotCallback()
) {
  takeFullSnapshot(timeStampNow(), SerializationKind.INITIAL_FULL_SNAPSHOT, emitRecord, emitStats, scope, serialize)

  return {
    /**
     * Call this when a new view starts to flush pending mutations and emit a subsequent full snapshot.
     */
    takeViewSnapshot: (timestamp: TimeStamp = timeStampNow()) => {
      flushMutations()
      takeFullSnapshot(timestamp, SerializationKind.SUBSEQUENT_FULL_SNAPSHOT, emitRecord, emitStats, scope, serialize)
    },
    stop: () => {
      // nothing to clean up in v8 (no lifecycle subscription)
    },
  }
}

export function takeFullSnapshot(
  timestamp: TimeStamp,
  kind: SerializationKind,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope,
  serialize: SerializeFullSnapshotCallback = defaultSerializeFullSnapshotCallback()
): void {
  const { width, height } = getViewportDimension()
  emitRecord({
    data: {
      height,
      href: window.location.href,
      width,
    },
    type: RecordType.Meta,
    timestamp,
  })

  emitRecord({
    data: {
      has_focus: document.hasFocus(),
    },
    type: RecordType.Focus,
    timestamp,
  })

  serialize(timestamp, kind, document, emitRecord, emitStats, scope)

  if (window.visualViewport) {
    emitRecord({
      data: getVisualViewport(window.visualViewport),
      type: RecordType.VisualViewport,
      timestamp,
    })
  }
}

function defaultSerializeFullSnapshotCallback(): SerializeFullSnapshotCallback {
  return isFullSnapshotChangeRecordsEnabled() ? serializeFullSnapshotAsChange : serializeFullSnapshot
}
