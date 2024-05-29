import type { DeflateEncoder } from '@datadog/browser-core'
import {
  DeflateEncoderStreamId,
  canUseEventBridge,
  noop,
  runOnReadyState,
  PageExitReason,
  BridgeCapability,
  bridgeSupports,
} from '@datadog/browser-core'
import type {
  LifeCycle,
  ViewContexts,
  RumSessionManager,
  RecorderApi,
  RumConfiguration,
  StartRecordingOptions,
} from '@datadog/browser-rum-core'
import { LifeCycleEventType, SessionReplayState } from '@datadog/browser-rum-core'
import { getReplayStats as getReplayStatsImpl } from '../domain/replayStats'
import { getSessionReplayLink } from '../domain/getSessionReplayLink'
import type { CreateDeflateWorker } from '../domain/deflate'
import {
  createDeflateEncoder,
  startDeflateWorker,
  DeflateWorkerStatus,
  getDeflateWorkerStatus,
} from '../domain/deflate'

import type { startRecording } from './startRecording'
import { isBrowserSupported } from './isBrowserSupported'

export type StartRecording = typeof startRecording

const enum RecorderStatus {
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
type RecorderState =
  | {
      status: RecorderStatus.Stopped
    }
  | {
      status: RecorderStatus.IntentToStart
    }
  | {
      status: RecorderStatus.Starting
    }
  | {
      status: RecorderStatus.Started
      stopRecording: () => void
    }

type StartStrategyFn = (options?: StartRecordingOptions) => void

export function makeRecorderApi(
  startRecordingImpl: StartRecording,
  createDeflateWorkerImpl?: CreateDeflateWorker
): RecorderApi {
  if ((canUseEventBridge() && !bridgeSupports(BridgeCapability.RECORDS)) || !isBrowserSupported()) {
    return {
      start: noop,
      stop: noop,
      getReplayStats: () => undefined,
      onRumStart: noop,
      isRecording: () => false,
      getSessionReplayLink: () => undefined,
    }
  }

  let state: RecorderState = {
    status: RecorderStatus.IntentToStart,
  }

  let startStrategy: StartStrategyFn = () => {
    state = { status: RecorderStatus.IntentToStart }
  }
  let stopStrategy = () => {
    state = { status: RecorderStatus.Stopped }
  }
  let getSessionReplayLinkStrategy = noop as () => string | undefined

  return {
    start: (options?: StartRecordingOptions) => startStrategy(options),
    stop: () => stopStrategy(),
    getSessionReplayLink: () => getSessionReplayLinkStrategy(),
    onRumStart: (
      lifeCycle: LifeCycle,
      configuration: RumConfiguration,
      sessionManager: RumSessionManager,
      viewContexts: ViewContexts,
      worker
    ) => {
      if (configuration.startSessionReplayRecordingManually) {
        state = { status: RecorderStatus.Stopped }
      }
      lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
        if (state.status === RecorderStatus.Starting || state.status === RecorderStatus.Started) {
          stopStrategy()
          state = { status: RecorderStatus.IntentToStart }
        }
      })

      // Stop the recorder on page unload to avoid sending records after the page is ended.
      lifeCycle.subscribe(LifeCycleEventType.PAGE_EXITED, (pageExitEvent) => {
        if (pageExitEvent.reason === PageExitReason.UNLOADING) {
          stopStrategy()
        }
      })

      lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
        if (state.status === RecorderStatus.IntentToStart) {
          startStrategy()
        }
      })

      let cachedDeflateEncoder: DeflateEncoder | undefined

      function getOrCreateDeflateEncoder() {
        if (!cachedDeflateEncoder) {
          if (!worker) {
            worker = startDeflateWorker(
              configuration,
              'Datadog Session Replay',
              () => {
                stopStrategy()
              },
              createDeflateWorkerImpl
            )
          }
          if (worker) {
            cachedDeflateEncoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
          }
        }
        return cachedDeflateEncoder
      }

      startStrategy = (options?: StartRecordingOptions) => {
        const session = sessionManager.findTrackedSession()
        if (!session || (session.sessionReplay === SessionReplayState.OFF && !options?.force)) {
          state = { status: RecorderStatus.IntentToStart }
          return
        }

        if (state.status === RecorderStatus.Starting || state.status === RecorderStatus.Started) {
          return
        }

        state = { status: RecorderStatus.Starting }

        runOnReadyState(configuration, 'interactive', () => {
          if (state.status !== RecorderStatus.Starting) {
            return
          }

          const deflateEncoder = getOrCreateDeflateEncoder()
          if (!deflateEncoder) {
            state = {
              status: RecorderStatus.Stopped,
            }
            return
          }

          const { stop: stopRecording } = startRecordingImpl(
            lifeCycle,
            configuration,
            sessionManager,
            viewContexts,
            deflateEncoder
          )
          state = {
            status: RecorderStatus.Started,
            stopRecording,
          }
        })

        if (options?.force && session.sessionReplay === SessionReplayState.OFF) {
          sessionManager.setForcedReplay()
        }
      }

      stopStrategy = () => {
        if (state.status === RecorderStatus.Stopped) {
          return
        }

        if (state.status === RecorderStatus.Started) {
          state.stopRecording()
        }

        state = {
          status: RecorderStatus.Stopped,
        }
      }

      getSessionReplayLinkStrategy = () =>
        getSessionReplayLink(configuration, sessionManager, viewContexts, state.status !== RecorderStatus.Stopped)

      if (state.status === RecorderStatus.IntentToStart) {
        startStrategy()
      }
    },

    isRecording: () =>
      // The worker is started optimistically, meaning we could have started to record but its
      // initialization fails a bit later. This could happen when:
      // * the worker URL (blob or plain URL) is blocked by CSP in Firefox only (Chromium and Safari
      // throw an exception when instantiating the worker, and IE doesn't care about CSP)
      // * the browser fails to load the worker in case the workerUrl is used
      // * an unexpected error occurs in the Worker before initialization, ex:
      //   * a runtime exception collected by monitor()
      //   * a syntax error notified by the browser via an error event
      // * the worker is unresponsive for some reason and timeouts
      //
      // It is not expected to happen often. Nonetheless, the "replayable" status on RUM events is
      // an important part of the Datadog App:
      // * If we have a false positive (we set has_replay: true even if no replay data is present),
      // we might display broken links to the Session Replay player.
      // * If we have a false negative (we don't set has_replay: true even if replay data is
      // available), it is less noticeable because no link will be displayed.
      //
      // Thus, it is better to have false negative, so let's make sure the worker is correctly
      // initialized before advertizing that we are recording.
      //
      // In the future, when the compression worker will also be used for RUM data, this will be
      // less important since no RUM event will be sent when the worker fails to initialize.
      getDeflateWorkerStatus() === DeflateWorkerStatus.Initialized && state.status === RecorderStatus.Started,

    getReplayStats: (viewId) =>
      getDeflateWorkerStatus() === DeflateWorkerStatus.Initialized ? getReplayStatsImpl(viewId) : undefined,
  }
}
