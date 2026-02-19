import { LifeCycleEventType, getViewportDimension } from '@datadog/browser-rum-core'
import type { LifeCycle } from '@datadog/browser-rum-core'
import { ExperimentalFeature, isExperimentalFeatureEnabled, timeStampNow } from '@datadog/browser-core'
import type { TimeStamp } from '@datadog/browser-core'
import { RecordType } from '../../types'
import { SerializationKind, serializeFullSnapshotAsChange, serializeFullSnapshot } from './serialization'
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
  serialize: SerializeFullSnapshotCallback = defaultSerializeFullSnapshotCallback()
) {
  takeFullSnapshot(timeStampNow(), SerializationKind.INITIAL_FULL_SNAPSHOT, emitRecord, emitStats, scope, serialize)

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    flushMutations()
    takeFullSnapshot(
      view.startClocks.timeStamp,
      SerializationKind.SUBSEQUENT_FULL_SNAPSHOT,
      emitRecord,
      emitStats,
      scope,
      serialize
    )
  })

  return {
    stop: unsubscribe,
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
  return isExperimentalFeatureEnabled(ExperimentalFeature.USE_CHANGE_RECORDS)
    ? serializeFullSnapshotAsChange
    : serializeFullSnapshot
}
