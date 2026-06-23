import { LifeCycleEventType, getViewportDimension } from '@openobserve/browser-rum-core'
import { timeStampNow } from '@openobserve/js-core/time'
import type { TimeStamp } from '@openobserve/js-core/time'
import type { LifeCycle } from '@openobserve/browser-rum-core'
import { RecordType } from '../../types'
import { SerializationKind, serializeFullSnapshot } from './serialization'
import { getVisualViewport } from './viewports'
import type { RecordingScope } from './recordingScope'
import type { EmitRecordCallback, EmitStatsCallback } from './record.types'

export function startFullSnapshots(
  lifeCycle: LifeCycle,
  emitRecord: EmitRecordCallback,
  emitStats: EmitStatsCallback,
  flushMutations: () => void,
  scope: RecordingScope
) {
  takeFullSnapshot(timeStampNow(), SerializationKind.INITIAL_FULL_SNAPSHOT, emitRecord, emitStats, scope)

  const { unsubscribe } = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    flushMutations()
    takeFullSnapshot(
      view.startClocks.timeStamp,
      SerializationKind.SUBSEQUENT_FULL_SNAPSHOT,
      emitRecord,
      emitStats,
      scope
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
  scope: RecordingScope
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

  serializeFullSnapshot(timestamp, kind, document, emitRecord, emitStats, scope)

  if (window.visualViewport) {
    emitRecord({
      data: getVisualViewport(window.visualViewport),
      type: RecordType.VisualViewport,
      timestamp,
    })
  }
}
