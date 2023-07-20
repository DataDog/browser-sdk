import { addTelemetryError, display, includes, addEventListener } from '@datadog/browser-core'
import type { DeflateWorkerAction, DeflateWorkerResponse } from '@datadog/browser-worker'
import { workerString } from '@datadog/browser-worker/string'

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

let workerURL: string | undefined

export function createDeflateWorker(): DeflateWorker {
  // Lazily compute the worker URL to allow importing the SDK in NodeJS
  if (!workerURL) {
    workerURL = URL.createObjectURL(new Blob([workerString]))
  }
  return new Worker(workerURL)
}

let state: DeflateWorkerState = { status: DeflateWorkerStatus.Nil }

export function startDeflateWorker(
  callback: (worker?: DeflateWorker) => void,
  createDeflateWorkerImpl = createDeflateWorker
) {
  switch (state.status) {
    case DeflateWorkerStatus.Nil:
      state = { status: DeflateWorkerStatus.Loading, callbacks: [callback] }
      doStartDeflateWorker(createDeflateWorkerImpl)
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
export function doStartDeflateWorker(createDeflateWorkerImpl = createDeflateWorker) {
  try {
    const worker = createDeflateWorkerImpl()
    addEventListener(worker, 'error', onError)
    addEventListener(worker, 'message', ({ data }: MessageEvent<DeflateWorkerResponse>) => {
      if (data.type === 'errored') {
        onError(data.error)
      } else if (data.type === 'initialized') {
        onInitialized(worker, data.version)
      }
    })
    worker.postMessage({ action: 'init' })
    return worker
  } catch (error) {
    onError(error)
  }
}

function onInitialized(worker: DeflateWorker, version: string) {
  if (state.status === DeflateWorkerStatus.Loading) {
    state.callbacks.forEach((callback) => callback(worker))
    state = { status: DeflateWorkerStatus.Initialized, worker, version }
  }
}

function onError(error: unknown) {
  if (state.status === DeflateWorkerStatus.Loading) {
    display.error('Session Replay recording failed to start: an error occurred while creating the Worker:', error)
    if (error instanceof Event || (error instanceof Error && isMessageCspRelated(error.message))) {
      display.error(
        'Please make sure CSP is correctly configured ' +
          'https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    } else {
      addTelemetryError(error)
    }
    state.callbacks.forEach((callback) => callback())
    state = { status: DeflateWorkerStatus.Error }
  } else {
    addTelemetryError(error, {
      worker_version: state.status === DeflateWorkerStatus.Initialized && state.version,
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
