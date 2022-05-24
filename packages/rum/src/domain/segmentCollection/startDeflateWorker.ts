import { addTelemetryError, display, includes, monitor } from '@datadog/browser-core'
import type { DeflateWorker } from './deflateWorker'
import { createDeflateWorker } from './deflateWorker'

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
    worker.addEventListener('error', monitor(onError))
    worker.addEventListener(
      'message',
      monitor(({ data }) => {
        if (data.type === 'errored') {
          onError(data.error)
        } else if (data.type === 'initialized') {
          onInitialized(worker)
        }
      })
    )
    worker.postMessage({ action: 'init' })
    return worker
  } catch (error) {
    onError(error)
  }
}

function onInitialized(worker: DeflateWorker) {
  if (state.status === DeflateWorkerStatus.Loading) {
    state.callbacks.forEach((callback) => callback(worker))
    state = { status: DeflateWorkerStatus.Initialized, worker }
  }
}

function onError(error: unknown) {
  if (state.status === DeflateWorkerStatus.Loading) {
    display.error('Session Replay recording failed to start: an error occurred while creating the Worker:', error)
    if (error instanceof Event || (error instanceof Error && includes(error.message, 'Content Security Policy'))) {
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
    addTelemetryError(error)
  }
}
