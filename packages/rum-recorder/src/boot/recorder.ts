import { Configuration, DOM_EVENT, addEventListeners } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, ParentContexts, RumSession } from '@datadog/browser-rum-core'

import { record } from '../domain/rrweb'
import { startSegmentCollection } from '../domain/segmentCollection'
import { send } from '../transport/send'
import { RawRecord, RecordType } from '../types'

export function startRecording(
  lifeCycle: LifeCycle,
  applicationId: string,
  configuration: Configuration,
  session: RumSession,
  parentContexts: ParentContexts
) {
  const { addRecord, stop: stopSegmentCollection } = startSegmentCollection(
    lifeCycle,
    applicationId,
    session,
    parentContexts,
    (data, meta) => send(configuration.sessionReplayEndpoint, data, meta)
  )

  function addRawRecord(rawRecord: RawRecord) {
    addRecord({ ...rawRecord, timestamp: Date.now() })
  }

  const { stop: stopRecording, takeFullSnapshot } = record({
    emit: addRawRecord,
  })!

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, takeFullSnapshot)
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, takeFullSnapshot)
  const { stop: stopTrackingFocusRecords } = trackFocusRecords(lifeCycle, addRawRecord)

  return {
    stop() {
      stopRecording()
      stopSegmentCollection()
      stopTrackingFocusRecords()
    },
  }
}

export function trackFocusRecords(lifeCycle: LifeCycle, addRawRecord: (record: RawRecord) => void) {
  function addFocusRecord() {
    addRawRecord({
      type: RecordType.Focus,
      data: {
        has_focus: document.hasFocus(),
      },
    })
  }
  addFocusRecord()
  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, addFocusRecord)
  return addEventListeners(window, [DOM_EVENT.FOCUS, DOM_EVENT.BLUR], addFocusRecord)
}
