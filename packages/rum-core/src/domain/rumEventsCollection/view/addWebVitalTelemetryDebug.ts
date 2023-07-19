import { addTelemetryDebug, elapsed, relativeNow, toServerDuration, type RelativeTime } from '@datadog/browser-core'
import type { RecorderApi } from '../../../boot/rumPublicApi'
import type { RumSessionManager } from '../../rumSessionManager'

export function addWebVitalTelemetryDebug(
  recorderApi: RecorderApi,
  session: RumSessionManager,
  webVitalName: string,
  webVitalNode: Node | undefined,
  webVitalTime: RelativeTime
) {
  const computationTime = relativeNow()
  if (!recorderApi.isRecording()) {
    recorderApi.recorderStartObservable.subscribe((recordingStartTime) => {
      addTelemetryDebug(`${webVitalName} attribution recording delay`, {
        computationDelay: toServerDuration(elapsed(webVitalTime, computationTime)),
        recordingDelay: toServerDuration(elapsed(webVitalTime, recordingStartTime)),
        hasNode: !!webVitalNode,
        serializedDomNode: webVitalNode ? recorderApi.getSerializedNodeId(webVitalNode) : undefined,
      })
    })
  }

  addTelemetryDebug(`${webVitalName} attribution`, {
    computationDelay: toServerDuration(elapsed(webVitalTime, computationTime)),
    hasNode: !!webVitalNode,
    replayRecording: recorderApi.isRecording(),
    replaySampled: session.findTrackedSession()?.sessionReplayAllowed,
    serializedDomNode: webVitalNode ? recorderApi.getSerializedNodeId(webVitalNode) : undefined,
  })
}
