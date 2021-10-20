import { addErrorToMonitoringBatch, display, includes, monitor } from '@datadog/browser-core'
import { createDeflateWorker, DeflateWorker } from './deflateWorker'

/**
 * For some browser like Firefox, "new Worker()" can fail and fire an 'error' event instead of an exception,
 * making the creation asynchronous. To handle it, we need a round trip of initialization messages to be sure
 * the creation is correct. These worker lifecycle states handle this case.
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
 * Browsers have discrepancies on how to handle worker errors:
 * - Chromium throws an exception
 * - Firefox fires an error event
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

function onError(error: ErrorEvent | Error | string) {
  if (state.status === DeflateWorkerStatus.Loading) {
    display.error('Session Replay recording failed to start: an error occurred while creating the Worker:', error)
    if (error instanceof Event || (error instanceof Error && includes(error.message, 'Content Security Policy'))) {
      display.error(
        'Please make sure CSP is correctly configured ' +
          'https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
      )
    } else {
      addErrorToMonitoringBatch(error)
    }
    state.callbacks.forEach((callback) => callback())
    state = { status: DeflateWorkerStatus.Error }
  } else {
    addErrorToMonitoringBatch(error)
  }
}
