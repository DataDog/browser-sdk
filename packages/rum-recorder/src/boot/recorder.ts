import { Configuration } from '@datadog/browser-core'
import { LifeCycle, ParentContexts } from '@datadog/browser-rum-core'

import { DeflateSegmentWriter } from '../domain/deflateSegmentWriter'
import { createDeflateWorker } from '../domain/deflateWorker'
import { record } from '../domain/rrweb'
import { startSegmentCollection } from '../domain/segmentCollection'
import { trackSegmentRenewal } from '../domain/trackSegmentRenewal'
import { send, SEND_BEACON_BYTE_LENGTH_LIMIT } from '../transport/send'

export function startRecording(
  lifeCycle: LifeCycle,
  applicationId: string,
  configuration: Configuration,
  parentContexts: ParentContexts
) {
  const worker = createDeflateWorker()

  const writer = new DeflateSegmentWriter(
    worker,
    (size) => {
      if (size > SEND_BEACON_BYTE_LENGTH_LIMIT) {
        renewSegment('max_size')
      }
    },
    (data, meta) => {
      send(configuration.sessionReplayEndpoint, data, meta)
    }
  )

  const { addRecord, renewSegment } = startSegmentCollection(
    () => getSegmentContext(applicationId, parentContexts),
    writer
  )

  const { stop: stopSegmentRenewal } = trackSegmentRenewal(lifeCycle, renewSegment)

  const stopRecording = record({
    emit: addRecord,
  })!

  return {
    stop() {
      stopSegmentRenewal()
      stopRecording()
      worker.terminate()
    },
  }
}

function getSegmentContext(applicationId: string, parentContexts: ParentContexts) {
  const viewContext = parentContexts.findView()
  if (!viewContext?.session.id) {
    return undefined
  }
  return {
    application: {
      id: applicationId,
    },
    session: {
      id: viewContext.session.id,
    },
    view: {
      id: viewContext.view.id,
    },
  }
}
