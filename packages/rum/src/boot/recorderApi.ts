import type { DeflateEncoder, DeflateWorker } from '@datadog/browser-core'
import {
  canUseEventBridge,
  noop,
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
import { getReplayStats as getReplayStatsImpl } from '../domain/replayStats'
import type { CreateDeflateWorker } from '../domain/deflate'
import {
  createDeflateEncoder,
  DeflateWorkerStatus,
  getDeflateWorkerStatus,
  startDeflateWorker,
} from '../domain/deflate'
import { isBrowserSupported } from './isBrowserSupported'
import type { StartRecording, Strategy } from './postStartStrategy'
import { createPostStartStrategy } from './postStartStrategy'

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

  // eslint-disable-next-line prefer-const
  let { strategy, getStatus: getPreStartStatus } = createPreStartStrategy()

  return {
    start: (options?: StartRecordingOptions) => strategy.start(options),
    stop: () => strategy.stop(),
    getSessionReplayLink: () => strategy.getSessionReplayLink(),
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
      getDeflateWorkerStatus() === DeflateWorkerStatus.Initialized && strategy.isRecording(),

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
    let cachedDeflateEncoder: DeflateEncoder | undefined

    function getOrCreateDeflateEncoder() {
      if (!cachedDeflateEncoder) {
        worker ??= startDeflateWorker(
          configuration,
          'Datadog Session Replay',
          () => {
            strategy.stop()
          },
          createDeflateWorkerImpl
        )

        if (worker) {
          cachedDeflateEncoder = createDeflateEncoder(configuration, worker, DeflateEncoderStreamId.REPLAY)
        }
      }
      return cachedDeflateEncoder
    }

    strategy = createPostStartStrategy(
      configuration,
      lifeCycle,
      sessionManager,
      viewHistory,
      startRecordingImpl,
      getOrCreateDeflateEncoder
    )

    const preStartStatus = getPreStartStatus()
    if (
      preStartStatus === PreStartRecorderStatus.HadManualStart ||
      (preStartStatus === PreStartRecorderStatus.None && !configuration.startSessionReplayRecordingManually)
    ) {
      strategy.start()
    }
  }
}

const enum PreStartRecorderStatus {
  None,
  HadManualStart,
  HadManualStop,
}

export function createPreStartStrategy(): { strategy: Strategy; getStatus: () => PreStartRecorderStatus } {
  let status = PreStartRecorderStatus.None
  return {
    strategy: {
      start() {
        status = PreStartRecorderStatus.HadManualStart
      },
      stop() {
        status = PreStartRecorderStatus.HadManualStop
      },
      getSessionReplayLink: noop as () => string | undefined,
      isRecording: () => false,
    },
    getStatus: () => status,
  }
}
