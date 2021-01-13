import { Configuration } from '@datadog/browser-core'
import { LifeCycle, ParentContexts } from '@datadog/browser-rum-core'

import { record } from '../domain/rrweb'
import { startSegmentCollection } from '../domain/segmentCollection'
import { send } from '../transport/send'

export function startRecording(
  lifeCycle: LifeCycle,
  applicationId: string,
  configuration: Configuration,
  parentContexts: ParentContexts
) {
  const { addRecord, stop: stopSegmentCollection } = startSegmentCollection(
    lifeCycle,
    applicationId,
    parentContexts,
    (data, meta) => send(configuration.sessionReplayEndpoint, data, meta)
  )

  const stopRecording = record({
    emit: addRecord,
  })!

  return {
    stop() {
      stopRecording()
      stopSegmentCollection()
    },
  }
}
