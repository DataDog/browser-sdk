import { addTelemetryDebug, elapsed, relativeNow, type RelativeTime } from '@datadog/browser-core'
import type { RecorderApi } from '../../../boot/rumPublicApi'

export function addWebVitalTelemetryDebug(
  recorderApi: RecorderApi,
  webVitalName: string,
  webVitalNode: Node | undefined,
  webVitalTime: RelativeTime
) {
  const computationTime = relativeNow()
  if (!recorderApi.isRecording()) {
    recorderApi.recorderStartObservable.subscribe((recordingStartTime) => {
      addTelemetryDebug(`${webVitalName} attribution recording delay`, {
        computationDelay: elapsed(webVitalTime, computationTime),
        recordingDelay: elapsed(webVitalTime, recordingStartTime),
        hasNode: !!webVitalNode,
        serializedDomNode: webVitalNode ? recorderApi.getSerializedNodeId(webVitalNode) : undefined,
      })
    })
  }

  addTelemetryDebug(`${webVitalName} attribution`, {
    computationDelay: elapsed(webVitalTime, computationTime),
    hasNode: !!webVitalNode,
    replayRecording: recorderApi.isRecording(),
    serializedDomNode: webVitalNode ? recorderApi.getSerializedNodeId(webVitalNode) : undefined,
  })
}
