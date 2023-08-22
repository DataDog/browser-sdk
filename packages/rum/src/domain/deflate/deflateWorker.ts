import { addTelemetryError, display, includes, addEventListener, setTimeout, ONE_SECOND } from '@datadog/browser-core'
import type { DeflateWorkerAction, DeflateWorkerResponse } from '@datadog/browser-worker'
import { workerString } from '@datadog/browser-worker/string'
import type { RumConfiguration } from '@datadog/browser-rum-core'

export const INITIALIZATION_TIME_OUT_DELAY = 10 * ONE_SECOND

/**
 * In order to be sure that the worker is correctly working, we need a round trip of
 * initialization messages, making the creation asynchronous.
 * These worker lifecycle states handle this case.
 */
const enum DeflateWorkerStatus {
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
      callbacks: Array<(worker?: DeflateWorker) => void>
    }
  | {
      status: DeflateWorkerStatus.Error
    }
  | {
      status: DeflateWorkerStatus.Initialized
      worker: DeflateWorker
      version: string
    }

export interface DeflateWorker extends Worker {
  postMessage(message: DeflateWorkerAction): void
}

let workerBlobUrl: string | undefined

function createWorkerBlobUrl() {
  // Lazily compute the worker URL to allow importing the SDK in NodeJS
  if (!workerBlobUrl) {
    workerBlobUrl = URL.createObjectURL(new Blob([workerString]))
  }
  return workerBlobUrl
}

export function createDeflateWorker(configuration: RumConfiguration): DeflateWorker {
  return new Worker(configuration.workerUrl || createWorkerBlobUrl())
}

let state: DeflateWorkerState = { status: DeflateWorkerStatus.Nil }

export function startDeflateWorker(
  configuration: RumConfiguration,
  callback: (worker?: DeflateWorker) => void,
  createDeflateWorkerImpl = createDeflateWorker
) {
  switch (state.status) {
    case DeflateWorkerStatus.Nil:
      state = { status: DeflateWorkerStatus.Loading, callbacks: [callback] }
      doStartDeflateWorker(configuration, createDeflateWorkerImpl)
      break
    case DeflateWorkerStatus.Loading:
      state.callbacks.push(callback)
      break
    case DeflateWorkerStatus.Error:
      callback()
      break
    case DeflateWorkerStatus.Initialized:
      callback(state.worker)
      break
  }
}

export function resetDeflateWorkerState() {
  state = { status: DeflateWorkerStatus.Nil }
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
export function doStartDeflateWorker(configuration: RumConfiguration, createDeflateWorkerImpl = createDeflateWorker) {
  try {
    const worker = createDeflateWorkerImpl(configuration)
    addEventListener(configuration, worker, 'error', (error) => {
      onError(configuration, error)
    })
    addEventListener(configuration, worker, 'message', ({ data }: MessageEvent<DeflateWorkerResponse>) => {
      if (data.type === 'errored') {
        onError(configuration, data.error, data.streamId)
      } else if (data.type === 'initialized') {
        onInitialized(worker, data.version)
      }
    })
    worker.postMessage({ action: 'init' })
    setTimeout(onTimeout, INITIALIZATION_TIME_OUT_DELAY)
    return worker
  } catch (error) {
    onError(configuration, error)
  }
}

function onTimeout() {
  if (state.status === DeflateWorkerStatus.Loading) {
    display.error('Session Replay recording failed to start: a timeout occurred while initializing the Worker')
    state.callbacks.forEach((callback) => callback())
    state = { status: DeflateWorkerStatus.Error }
  }
}

function onInitialized(worker: DeflateWorker, version: string) {
  if (state.status === DeflateWorkerStatus.Loading) {
    state.callbacks.forEach((callback) => callback(worker))
    state = { status: DeflateWorkerStatus.Initialized, worker, version }
  }
}

function onError(configuration: RumConfiguration, error: unknown, streamId?: number) {
  if (state.status === DeflateWorkerStatus.Loading) {
    display.error('Session Replay recording failed to start: an error occurred while creating the Worker:', error)
    if (error instanceof Event || (error instanceof Error && isMessageCspRelated(error.message))) {
      let baseMessage
      if (configuration.workerUrl) {
        baseMessage = `Please make sure the Worker URL ${configuration.workerUrl} is correct and CSP is correctly configured.`
      } else {
        baseMessage = 'Please make sure CSP is correctly configured.'
      }
      display.error(
        `${baseMessage} See documentation at https://docs.datadoghq.com/integrations/content_security_policy_logs/#use-csp-with-real-user-monitoring-and-session-replay`
      )
    } else {
      addTelemetryError(error)
    }
    state.callbacks.forEach((callback) => callback())
    state = { status: DeflateWorkerStatus.Error }
  } else {
    addTelemetryError(error, {
      worker_version: state.status === DeflateWorkerStatus.Initialized && state.version,
      stream_id: streamId,
    })
  }
}

function isMessageCspRelated(message: string) {
  return (
    includes(message, 'Content Security Policy') ||
    // Related to `require-trusted-types-for` CSP: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-trusted-types-for
    includes(message, "requires 'TrustedScriptURL'")
  )
}
