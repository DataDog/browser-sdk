import { addErrorToMonitoringBatch, display, includes, monitor } from '@datadog/browser-core'
import { createDeflateWorker, DeflateWorker } from './deflateWorker'

const enum DeflateWorkerSingletonStatus {
  Nil,
  Loading,
  Error,
  Ready,
}

type DeflateWorkerSingletonState =
  | {
      status: DeflateWorkerSingletonStatus.Nil
    }
  | {
      status: DeflateWorkerSingletonStatus.Loading
      callbacks: Array<(worker?: DeflateWorker) => void>
    }
  | {
      status: DeflateWorkerSingletonStatus.Error
    }
  | {
      status: DeflateWorkerSingletonStatus.Ready
      worker: DeflateWorker
    }

let state: DeflateWorkerSingletonState = { status: DeflateWorkerSingletonStatus.Nil }

export function loadDeflateWorkerSingleton(callback: (worker?: DeflateWorker) => void) {
  switch (state.status) {
    case DeflateWorkerSingletonStatus.Nil:
      state = { status: DeflateWorkerSingletonStatus.Loading, callbacks: [callback] }
      startDeflateWorkerSingleton()
      break
    case DeflateWorkerSingletonStatus.Loading:
      state.callbacks.push(callback)
      break
    case DeflateWorkerSingletonStatus.Error:
      callback()
      break
    case DeflateWorkerSingletonStatus.Ready:
      callback(state.worker)
      break
  }
}

function startDeflateWorkerSingleton() {
  try {
    const worker = createDeflateWorker()
    worker.addEventListener('error', monitor(onError))
    worker.addEventListener(
      'message',
      monitor(({ data }) => {
        if (data.type === 'error') {
          onError(data.error)
        } else if (data.type === 'ready') {
          onReady(worker)
        }
      })
    )
    worker.postMessage({ action: 'init' })
  } catch (error) {
    onError(error)
  }
}

function onReady(worker: DeflateWorker) {
  if (state.status === DeflateWorkerSingletonStatus.Loading) {
    state.callbacks.forEach((callback) => callback(worker))
    state = { status: DeflateWorkerSingletonStatus.Ready, worker }
  }
}

function onError(error: ErrorEvent | Error | string) {
  if (state.status === DeflateWorkerSingletonStatus.Loading) {
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
    state = { status: DeflateWorkerSingletonStatus.Error }
  } else {
    addErrorToMonitoringBatch(error)
  }
}
