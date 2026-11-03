import type { DeflateWorker, SdkWorkerResponse } from '@datadog/browser-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import { addTelemetryError, display } from '@datadog/browser-core'
import { mockable, setTimeout } from '@datadog/js-core/util'
import { addEventListener } from '@datadog/js-core/dom'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { reportScriptLoadingError } from '../scriptLoadingError'

export const INITIALIZATION_TIME_OUT_DELAY = 30 * ONE_SECOND

declare const __BUILD_ENV__WORKER_STRING__: string

/**
 * In order to be sure that the worker is correctly working, we need a round trip of
 * initialization messages, making the creation asynchronous.
 * These worker lifecycle states handle this case.
 */
export const enum DeflateWorkerStatus {
  Nil,
  Loading,
  Error,
  Initialized,
}

type DeflateWorkerState =
  | {
      status: DeflateWorkerStatus.Nil
    }
  | {
      status: DeflateWorkerStatus.Loading
      worker: DeflateWorker
      stop: () => void
      initializationFailureCallbacks: Array<() => void>
    }
  | {
      status: DeflateWorkerStatus.Error
    }
  | {
      status: DeflateWorkerStatus.Initialized
      worker: DeflateWorker
      stop: () => void
      version: string
    }

export type CreateDeflateWorker = typeof createDeflateWorker

export function createDeflateWorker(configuration: RumConfiguration): DeflateWorker {
  return new Worker(configuration.workerUrl || URL.createObjectURL(new Blob([__BUILD_ENV__WORKER_STRING__])))
}

/**
 * Several workers can run in parallel from the same worker script, each with its own lifecycle:
 * - 'deflate' compresses Session Replay (and other) data
 * - 'canvas' processes canvas captures, so it never blocks compression
 */
export type WorkerName = 'deflate' | 'canvas'

const states = new Map<WorkerName, DeflateWorkerState>()

function getState(name: WorkerName): DeflateWorkerState {
  return states.get(name) || { status: DeflateWorkerStatus.Nil }
}

export function startDeflateWorker(
  configuration: RumConfiguration,
  source: string,
  onInitializationFailure: () => void,
  name: WorkerName = 'deflate'
) {
  if (getState(name).status === DeflateWorkerStatus.Nil) {
    // doStartDeflateWorker updates the state to "loading" or "error"
    doStartDeflateWorker(configuration, source, name)
  }

  const state = getState(name)
  switch (state.status) {
    case DeflateWorkerStatus.Loading:
      state.initializationFailureCallbacks.push(onInitializationFailure)
      return state.worker
    case DeflateWorkerStatus.Initialized:
      return state.worker
  }
}

export function resetDeflateWorkerState() {
  states.forEach((state) => {
    if (state.status === DeflateWorkerStatus.Initialized || state.status === DeflateWorkerStatus.Loading) {
      state.stop()
    }
  })
  states.clear()
}

export function getDeflateWorkerStatus(name: WorkerName = 'deflate') {
  return getState(name).status
}

/**
 * Starts the deflate worker and handle messages and errors
 *
 * The spec allow browsers to handle worker errors differently:
 * - Chromium throws an exception
 * - Firefox fires an error event
 *
 * more details: https://bugzilla.mozilla.org/show_bug.cgi?id=1736865#c2
 */
export function doStartDeflateWorker(configuration: RumConfiguration, source: string, name: WorkerName) {
  try {
    const worker = mockable(createDeflateWorker)(configuration)
    const { stop: removeErrorListener } = addEventListener(worker, 'error', (error) => {
      onError(configuration, source, name, error)
    })
    const { stop: removeMessageListener } = addEventListener(
      worker,
      'message',
      ({ data }: MessageEvent<SdkWorkerResponse>) => {
        if (data.type === 'errored') {
          onError(configuration, source, name, data.error, data.streamId)
        } else if (data.type === 'initialized') {
          onInitialized(name, data.version)
        }
      }
    )
    worker.postMessage({ action: 'init' })
    setTimeout(() => onTimeout(source, name), INITIALIZATION_TIME_OUT_DELAY)
    const stop = () => {
      removeErrorListener()
      removeMessageListener()
    }

    states.set(name, { status: DeflateWorkerStatus.Loading, worker, stop, initializationFailureCallbacks: [] })
  } catch (error) {
    onError(configuration, source, name, error)
  }
}

function onTimeout(source: string, name: WorkerName) {
  const state = getState(name)
  if (state.status === DeflateWorkerStatus.Loading) {
    display.error(`${source} failed to start: a timeout occurred while initializing the Worker`)
    state.initializationFailureCallbacks.forEach((callback) => callback())
    states.set(name, { status: DeflateWorkerStatus.Error })
  }
}

function onInitialized(name: WorkerName, version: string) {
  const state = getState(name)
  if (state.status === DeflateWorkerStatus.Loading) {
    states.set(name, { status: DeflateWorkerStatus.Initialized, worker: state.worker, stop: state.stop, version })
  }
}

function onError(configuration: RumConfiguration, source: string, name: WorkerName, error: unknown, streamId?: number) {
  const state = getState(name)
  if (state.status === DeflateWorkerStatus.Loading || state.status === DeflateWorkerStatus.Nil) {
    reportScriptLoadingError({
      configuredUrl: configuration.workerUrl,
      error,
      source,
      scriptType: 'worker',
    })
    if (state.status === DeflateWorkerStatus.Loading) {
      state.initializationFailureCallbacks.forEach((callback) => callback())
    }
    states.set(name, { status: DeflateWorkerStatus.Error })
  } else {
    addTelemetryError(error, {
      worker_version: state.status === DeflateWorkerStatus.Initialized && state.version,
      stream_id: streamId,
    })
  }
}
