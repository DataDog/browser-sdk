import type {
  LifeCycle,
  RumConfiguration,
  RumSessionManager,
  StartRecordingOptions,
  ViewHistory,
  RumSession,
} from '@datadog/browser-rum-core'
import { LifeCycleEventType, SessionReplayState } from '@datadog/browser-rum-core'
import type { Telemetry, DeflateEncoder } from '@datadog/browser-core'
import { asyncRunOnReadyState, monitorError, Observable } from '@datadog/browser-core'
import { getSessionReplayLink } from '../domain/getSessionReplayLink'
import { startRecorderInitTelemetry } from '../domain/startRecorderInitTelemetry'
import type { startRecording } from './startRecording'

export type StartRecording = typeof startRecording

export const enum RecorderStatus {
  // The recorder is stopped.
  Stopped,
  // The user started the recording while it wasn't possible yet. The recorder should start as soon
  // as possible.
  IntentToStart,
  // The recorder is starting. It does not record anything yet.
  Starting,
  // The recorder is started, it records the session.
  Started,
}

export type RecorderInitEvent =
  | { type: 'start'; forced: boolean }
  | { type: 'document-ready' }
  | { type: 'recorder-settled' }
  | { type: 'aborted' }
  | { type: 'deflate-encoder-load-failed' }
  | { type: 'recorder-load-failed' }
  | { type: 'succeeded' }

export interface Strategy {
  start: (options?: StartRecordingOptions) => void
  stop: () => void
  isRecording: () => boolean
  getSessionReplayLink: () => string | undefined
}

export function createPostStartStrategy(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  sessionManager: RumSessionManager,
  viewHistory: ViewHistory,
  loadRecorder: () => Promise<StartRecording | undefined>,
  getOrCreateDeflateEncoder: () => DeflateEncoder | undefined,
  telemetry: Telemetry
): Strategy {
  let status = RecorderStatus.Stopped
  let stopRecording: () => void

  lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
    if (status === RecorderStatus.Starting || status === RecorderStatus.Started) {
      stop()
      status = RecorderStatus.IntentToStart
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    if (status === RecorderStatus.IntentToStart) {
      start()
    }
  })

  const observable = new Observable<RecorderInitEvent>()
  startRecorderInitTelemetry(telemetry, observable)

  const doStart = async (forced: boolean) => {
    observable.notify({ type: 'start', forced })

    const [startRecordingImpl] = await Promise.all([
      notifyWhenSettled(observable, { type: 'recorder-settled' }, loadRecorder()),
      notifyWhenSettled(observable, { type: 'document-ready' }, asyncRunOnReadyState(configuration, 'interactive')),
    ])

    if (status !== RecorderStatus.Starting) {
      observable.notify({ type: 'aborted' })
      return
    }

    if (!startRecordingImpl) {
      status = RecorderStatus.Stopped
      observable.notify({ type: 'recorder-load-failed' })
      return
    }

    const deflateEncoder = getOrCreateDeflateEncoder()
    if (!deflateEncoder) {
      status = RecorderStatus.Stopped
      observable.notify({ type: 'deflate-encoder-load-failed' })
      return
    }

    ;({ stop: stopRecording } = startRecordingImpl(
      lifeCycle,
      configuration,
      sessionManager,
      viewHistory,
      deflateEncoder,
      telemetry
    ))

    status = RecorderStatus.Started
    observable.notify({ type: 'succeeded' })
  }

  function start(options?: StartRecordingOptions) {
    const session = sessionManager.findTrackedSession()
    if (canStartRecording(session, options)) {
      status = RecorderStatus.IntentToStart
      return
    }

    if (isRecordingInProgress(status)) {
      return
    }

    status = RecorderStatus.Starting

    const forced = shouldForceReplay(session!, options) || false

    // Intentionally not awaiting doStart() to keep it asynchronous
    doStart(forced).catch(monitorError)

    if (forced) {
      sessionManager.setForcedReplay()
    }
  }

  function stop() {
    if (status === RecorderStatus.Started) {
      stopRecording?.()
    }

    status = RecorderStatus.Stopped
  }

  return {
    start,
    stop,
    getSessionReplayLink() {
      return getSessionReplayLink(configuration, sessionManager, viewHistory, status !== RecorderStatus.Stopped)
    },
    isRecording: () => status === RecorderStatus.Started,
  }
}

function canStartRecording(session: RumSession | undefined, options?: StartRecordingOptions) {
  return !session || (session.sessionReplay === SessionReplayState.OFF && (!options || !options.force))
}

function isRecordingInProgress(status: RecorderStatus) {
  return status === RecorderStatus.Starting || status === RecorderStatus.Started
}

function shouldForceReplay(session: RumSession, options?: StartRecordingOptions) {
  return options && options.force && session.sessionReplay === SessionReplayState.OFF
}

async function notifyWhenSettled<Event, Result>(
  observable: Observable<Event>,
  event: Event,
  promise: Promise<Result>
): Promise<Result> {
  try {
    return await promise
  } finally {
    observable.notify(event)
  }
}
