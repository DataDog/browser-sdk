import { getViewportDimension } from '@datadog/browser-rum-core'
import type { LifeCycle, RumCoreEvents } from '@datadog/browser-rum-core'
import { ExperimentalFeature, isExperimentalFeatureEnabled, timeStampNow } from '@datadog/browser-core'
import type { TimeStamp } from '@datadog/browser-core'
import type { Pipeline } from '@datadog/browser-core-next'
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

export type SerializeFullSnapshotCallback = (
  timestamp: TimeStamp,
  kind: SerializationKind,
  document: Document,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  scope: RecordingScope
) => void

export function startFullSnapshots(
  lifeCycle: LifeCycle,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  flushMutations: () => void,
  scope: RecordingScope,
  serialize: SerializeFullSnapshotCallback = defaultSerializeFullSnapshotCallback(),
  pipeline?: Pipeline<RumCoreEvents>
) {
  takeFullSnapshot(timeStampNow(), SerializationKind.INITIAL_FULL_SNAPSHOT, emitRecord, emitStats, scope, serialize)

  const subscription = pipeline
    ? pipeline.subscribe('signal', (signal) => {
        if (signal.type === 'viewCreated') {
          flushMutations()
          takeFullSnapshot(
            signal.startClocks.timeStamp,
            SerializationKind.SUBSEQUENT_FULL_SNAPSHOT,
            emitRecord,
            emitStats,
            scope,
            serialize
          )
        }
      })
    : { unsubscribe: () => {} }

  return {
    stop: subscription.unsubscribe,
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
