import { Configuration } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, ParentContexts, RumSession } from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import { startSegmentCollection } from '../domain/segmentCollection'
import { send } from '../transport/send'
import { RawRecord, RecordType } from '../types'

let configurationProviderRef: Configuration | undefined;

export function startRecording(
  lifeCycle: LifeCycle,
  applicationId: string,
  configuration: Configuration,
  session: RumSession,
  parentContexts: ParentContexts
) {
  configurationProviderRef = configuration;
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
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, takeFullSnapshot)
  trackViewEndRecord(lifeCycle, (record) => addRawRecord(record))

  return {
    stop: () => {
      stopRecording()
      stopSegmentCollection()
      configurationProviderRef = undefined;
    },
  }
}

export function trackViewEndRecord(lifeCycle: LifeCycle, addRawRecord: (record: RawRecord) => void) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, () => {
    addRawRecord({
      type: RecordType.ViewEnd,
    })
  })
}

export function getRumRecorderConfig (): Configuration | undefined {
  return configurationProviderRef;
}
