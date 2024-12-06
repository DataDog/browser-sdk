import type {
  LifeCycle,
  RumConfiguration,
  RumSessionManager,
  StartRecordingOptions,
  ViewHistory,
  RumSession,
} from '@datadog/browser-rum-core'
import { LifeCycleEventType, SessionReplayState } from '@datadog/browser-rum-core'
import { PageExitReason, runOnReadyState, type DeflateEncoder } from '@datadog/browser-core'
import { getSessionReplayLink } from '../domain/getSessionReplayLink'
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
  startRecordingImpl: StartRecording,
  getOrCreateDeflateEncoder: () => DeflateEncoder | undefined
): Strategy {
  let status = RecorderStatus.Stopped

  lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
    if (status === RecorderStatus.Starting || status === RecorderStatus.Started) {
      stop()
      status = RecorderStatus.IntentToStart
    }
  })

  // Stop the recorder on page unload to avoid sending records after the page is ended.
  lifeCycle.subscribe(LifeCycleEventType.PAGE_EXITED, (pageExitEvent) => {
    if (pageExitEvent.reason === PageExitReason.UNLOADING) {
      stop()
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    if (status === RecorderStatus.IntentToStart) {
      start()
    }
  })

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

    runOnReadyState(configuration, 'interactive', () => {
      if (status !== RecorderStatus.Starting) {
        return
      }

      const deflateEncoder = getOrCreateDeflateEncoder()
      if (!deflateEncoder) {
        status = RecorderStatus.Stopped
        return
      }

      ;({ stop: stopRecording } = startRecordingImpl(
        lifeCycle,
        configuration,
        sessionManager,
        viewHistory,
        deflateEncoder
      ))

      status = RecorderStatus.Started
    })

    if (shouldForceReplay(session!, options)) {
      sessionManager.setForcedReplay()
    }
  }

  function stop() {
    if (status !== RecorderStatus.Stopped && status === RecorderStatus.Started) {
      stopRecording?.()
    }

    status = RecorderStatus.Stopped
  }

  let stopRecording: () => void
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
