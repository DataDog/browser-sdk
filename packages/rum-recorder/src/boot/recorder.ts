import { Configuration } from '@datadog/browser-core'
import { LifeCycle, ParentContexts, RumSession } from '@datadog/browser-rum-core'

import { record } from '../domain/rrweb'
import { startSegmentCollection } from '../domain/segmentCollection'
import { send } from '../transport/send'

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

  const { stop: stopRecording, takeFullSnapshot } = record({
    emit: addRecord,
  })!

  return {
    stop() {
      stopRecording()
      stopSegmentCollection()
    },
  }
}
