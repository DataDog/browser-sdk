import type { DeflateEncoder, DeflateWorker } from '@datadog/browser-core'
import {
  canUseEventBridge,
  noop,
  PageExitReason,
  BridgeCapability,
  bridgeSupports,
  DeflateEncoderStreamId,
} from '@datadog/browser-core'
import type {
  LifeCycle,
  ViewHistory,
  RumSessionManager,
  RecorderApi,
  RumConfiguration,
  StartRecordingOptions,
} from '@datadog/browser-rum-core'
import { LifeCycleEventType } from '@datadog/browser-rum-core'
import { getReplayStats as getReplayStatsImpl } from '../domain/replayStats'
import type { CreateDeflateWorker } from '../domain/deflate'
import {
  createDeflateEncoder,
  DeflateWorkerStatus,
  getDeflateWorkerStatus,
  startDeflateWorker,
} from '../domain/deflate'
import { isBrowserSupported } from './isBrowserSupported'
import type { RecorderState, StartRecording, Strategy } from './postStartStrategy'
import { createPostStartStrategy, RecorderStatus } from './postStartStrategy'

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

  const state: RecorderState = {
    status: RecorderStatus.IntentToStart,
    setStatus(updatedStatus: RecorderStatus) {
      state.status = updatedStatus
    },
    statusEqual(status: RecorderStatus) {
      return state.status === status
    },
  }

  let strategies: Strategy = createPreStartStrategy(state)

  return {
    start: (options?: StartRecordingOptions) => strategies.startStrategy(options),
    stop: () => strategies.stopStrategy(),
    getSessionReplayLink: () => strategies.getSessionReplayLinkStrategy(),
    onRumStart,
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

  function onRumStart(
    lifeCycle: LifeCycle,
    configuration: RumConfiguration,
    sessionManager: RumSessionManager,
    viewHistory: ViewHistory,
    worker: DeflateWorker | undefined
  ) {
    if (configuration.startSessionReplayRecordingManually) {
      state.setStatus(RecorderStatus.Stopped)
    }
    lifeCycle.subscribe(LifeCycleEventType.SESSION_EXPIRED, () => {
      if (state.status === RecorderStatus.Starting || state.status === RecorderStatus.Started) {
        strategies.stopStrategy()
        state.setStatus(RecorderStatus.IntentToStart)
      }
    })

    // Stop the recorder on page unload to avoid sending records after the page is ended.
    lifeCycle.subscribe(LifeCycleEventType.PAGE_EXITED, (pageExitEvent) => {
      if (pageExitEvent.reason === PageExitReason.UNLOADING) {
        strategies.stopStrategy()
      }
    })

    lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
      if (state.status === RecorderStatus.IntentToStart) {
        strategies.startStrategy()
      }
    })

    let cachedDeflateEncoder: DeflateEncoder | undefined

    function getOrCreateDeflateEncoder() {
      if (!cachedDeflateEncoder) {
        worker ??= startDeflateWorker(
          configuration,
          'Datadog Session Replay',
          () => {
            strategies.stopStrategy()
          },
          createDeflateWorkerImpl
        )

        if (worker) {
          cachedDeflateEncoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
        }
      }
      return cachedDeflateEncoder
    }

    strategies = createPostStartStrategy(
      configuration,
      lifeCycle,
      sessionManager,
      viewHistory,
      startRecordingImpl,
      getOrCreateDeflateEncoder,
      state
    )

    if (state.status === RecorderStatus.IntentToStart) {
      strategies.startStrategy()
    }
  }
}

export function createPreStartStrategy(state: RecorderState): Strategy {
  return {
    startStrategy(_options?: StartRecordingOptions) {
      state.setStatus(RecorderStatus.IntentToStart)
    },
    stopStrategy() {
      state.setStatus(RecorderStatus.Stopped)
    },
    getSessionReplayLinkStrategy: noop as () => string | undefined,
  }
}
