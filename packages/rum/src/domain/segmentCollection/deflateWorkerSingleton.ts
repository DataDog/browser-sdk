import { addErrorToMonitoringBatch, display, includes, monitor } from '@datadog/browser-core'
import { createDeflateWorker, DeflateWorker } from './deflateWorker'

let workerSingleton: DeflateWorker

export function getDeflateWorkerSingleton() {
  if (!workerSingleton) {
    try {
      workerSingleton = createDeflateWorker()
    } catch (error) {
      display.error('Session Replay recording failed to start: an error occurred while creating the Worker:', error)
      if (includes(error.message, 'Content Security Policy')) {
        display.error(
          'Please make sure CSP is correctly configured ' +
            'https://docs.datadoghq.com/real_user_monitoring/faq/content_security_policy'
        )
      } else {
        addErrorToMonitoringBatch(error)
      }
      return
    }
    workerSingleton.addEventListener(
      'message',
      monitor(({ data }) => {
        if ('error' in data) {
          addErrorToMonitoringBatch(data.error)
        }
      })
    )
  }
  return workerSingleton
}
