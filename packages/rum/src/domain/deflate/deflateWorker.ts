import type { DeflateWorker, DeflateWorkerResponse } from '@datadog/browser-core'
import {
  addTelemetryError,
  display,
  includes,
  addEventListener,
  setTimeout,
  ONE_SECOND,
  DOCS_ORIGIN,
} from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'

export const INITIALIZATION_TIME_OUT_DELAY = 10 * ONE_SECOND

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

function createDeflateWorker(configuration: RumConfiguration): DeflateWorker {
  return new Worker(configuration.workerUrl || URL.createObjectURL(new Blob([__BUILD_ENV__WORKER_STRING__])))
}

let state: DeflateWorkerState = { status: DeflateWorkerStatus.Nil }

export function startDeflateWorker(
  configuration: RumConfiguration,
  source: string,
  onInitializationFailure: () => void,
  createDeflateWorkerImpl = createDeflateWorker
) {
  if (state.status === DeflateWorkerStatus.Nil) {
    // doStartDeflateWorker updates the state to "loading" or "error"
    doStartDeflateWorker(configuration, source, createDeflateWorkerImpl)
  }

  switch (state.status) {
    case DeflateWorkerStatus.Loading:
      state.initializationFailureCallbacks.push(onInitializationFailure)
      return state.worker
    case DeflateWorkerStatus.Initialized:
      return state.worker
  }
}

export function resetDeflateWorkerState() {
  if (state.status === DeflateWorkerStatus.Initialized || state.status === DeflateWorkerStatus.Loading) {
    state.stop()
  }
  state = { status: DeflateWorkerStatus.Nil }
}

export function getDeflateWorkerStatus() {
  return state.status
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
export function doStartDeflateWorker(
  configuration: RumConfiguration,
  source: string,
  createDeflateWorkerImpl = createDeflateWorker
) {
  try {
    const worker = createDeflateWorkerImpl(configuration)
    const { stop: removeErrorListener } = addEventListener(configuration, worker, 'error', (error) => {
      onError(configuration, source, error)
    })
    const { stop: removeMessageListener } = addEventListener(
      configuration,
      worker,
      'message',
      ({ data }: MessageEvent<DeflateWorkerResponse>) => {
        if (data.type === 'errored') {
          onError(configuration, source, data.error, data.streamId)
        } else if (data.type === 'initialized') {
          onInitialized(data.version)
        }
      }
    )
    worker.postMessage({ action: 'init' })
    setTimeout(() => onTimeout(source), INITIALIZATION_TIME_OUT_DELAY)
    const stop = () => {
      removeErrorListener()
      removeMessageListener()
    }

    state = { status: DeflateWorkerStatus.Loading, worker, stop, initializationFailureCallbacks: [] }
  } catch (error) {
    onError(configuration, source, error)
  }
}

function onTimeout(source: string) {
  if (state.status === DeflateWorkerStatus.Loading) {
    display.error(`${source} failed to start: a timeout occurred while initializing the Worker`)
    state.initializationFailureCallbacks.forEach((callback) => callback())
    state = { status: DeflateWorkerStatus.Error }
  }
}

function onInitialized(version: string) {
  if (state.status === DeflateWorkerStatus.Loading) {
    state = { status: DeflateWorkerStatus.Initialized, worker: state.worker, stop: state.stop, version }
  }
}

function onError(configuration: RumConfiguration, source: string, error: unknown, streamId?: number) {
  if (state.status === DeflateWorkerStatus.Loading || state.status === DeflateWorkerStatus.Nil) {
    display.error(`${source} failed to start: an error occurred while creating the Worker:`, error)
    if (error instanceof Event || (error instanceof Error && isMessageCspRelated(error.message))) {
      let baseMessage
      if (configuration.workerUrl) {
        baseMessage = `Please make sure the Worker URL ${configuration.workerUrl} is correct and CSP is correctly configured.`
      } else {
        baseMessage = 'Please make sure CSP is correctly configured.'
      }
      display.error(
        `${baseMessage} See documentation at ${DOCS_ORIGIN}/integrations/content_security_policy_logs/#use-csp-with-real-user-monitoring-and-session-replay`
      )
    } else {
      addTelemetryError(error)
    }
    if (state.status === DeflateWorkerStatus.Loading) {
      state.initializationFailureCallbacks.forEach((callback) => callback())
    }
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
