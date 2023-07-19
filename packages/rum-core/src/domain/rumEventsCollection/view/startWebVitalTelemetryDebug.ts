import { addTelemetryDebug, elapsed, noop, performDraw, relativeNow, toServerDuration } from '@datadog/browser-core'
import type { Telemetry, RelativeTime } from '@datadog/browser-core'
import type { RecorderApi } from '../../../boot/rumPublicApi'
import type { RumSessionManager } from '../../rumSessionManager'
import type { RumConfiguration } from '../../configuration'

export type WebVitalTelemetryDebug = ReturnType<typeof startWebVitalTelemetryDebug>

export function startWebVitalTelemetryDebug(
  configuration: RumConfiguration,
  telemetry: Telemetry,
  recorderApi: RecorderApi,
  session: RumSessionManager
) {
  const webVitalTelemetryEnabled = telemetry.enabled && performDraw(configuration.customerDataTelemetrySampleRate)

  if (!webVitalTelemetryEnabled) {
    return {
      addWebVitalTelemetryDebug: noop,
    }
  }
  return {
    addWebVitalTelemetryDebug(webVitalName: string, webVitalNode: Node | undefined, webVitalTime: RelativeTime) {
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
    },
  }
}
