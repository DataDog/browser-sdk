import type { Context, Duration, Telemetry, Observable, TimeStamp } from '@datadog/browser-core'
import { performDraw, addTelemetryMetrics, noop, timeStampNow, elapsed } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { RecorderInitEvent } from '../boot/postStartStrategy'

const RECORDER_INIT_METRICS_TELEMETRY_NAME = 'Recorder init metrics'

type RecorderInitResult = 'aborted' | 'deflate-encoder-load-failed' | 'recorder-load-failed' | 'succeeded'

export interface RecorderInitMetrics extends Context {
  forced: boolean
  loadRecorderModuleDuration: number | undefined
  recorderInitDuration: number
  result: RecorderInitResult
  waitForDocReadyDuration: number | undefined
}

export function startRecorderInitTelemetry(
  configuration: RumConfiguration,
  telemetry: Telemetry,
  observable: Observable<RecorderInitEvent>
) {
  const recorderInitTelemetryEnabled = telemetry.enabled && performDraw(configuration.replayTelemetrySampleRate)
  if (!recorderInitTelemetryEnabled) {
    return { stop: noop }
  }

  let startContext:
    | {
        forced: boolean
        timestamp: TimeStamp
      }
    | undefined

  let documentReadyDuration: Duration | undefined
  let recorderSettledDuration: Duration | undefined

  const { unsubscribe } = observable.subscribe((event) => {
    switch (event.type) {
      case 'start':
        startContext = { forced: event.forced, timestamp: timeStampNow() }
        documentReadyDuration = undefined
        recorderSettledDuration = undefined
        break

      case 'document-ready':
        if (startContext) {
          documentReadyDuration = elapsed(startContext.timestamp, timeStampNow())
        }
        break

      case 'recorder-settled':
        if (startContext) {
          recorderSettledDuration = elapsed(startContext.timestamp, timeStampNow())
        }
        break

      case 'aborted':
      case 'deflate-encoder-load-failed':
      case 'recorder-load-failed':
      case 'succeeded':
        // Only send metrics for the first attempt at starting the recorder.
        unsubscribe()

        if (startContext) {
          addTelemetryMetrics(RECORDER_INIT_METRICS_TELEMETRY_NAME, {
            metrics: createRecorderInitMetrics(
              startContext.forced,
              recorderSettledDuration,
              elapsed(startContext.timestamp, timeStampNow()),
              event.type,
              documentReadyDuration
            ),
          })
        }
        break
    }
  })

  return { stop: unsubscribe }
}

function createRecorderInitMetrics(
  forced: boolean,
  loadRecorderModuleDuration: Duration | undefined,
  recorderInitDuration: Duration,
  result: RecorderInitResult,
  waitForDocReadyDuration: Duration | undefined
): RecorderInitMetrics {
  return {
    forced,
    loadRecorderModuleDuration,
    recorderInitDuration,
    result,
    waitForDocReadyDuration,
  }
}
