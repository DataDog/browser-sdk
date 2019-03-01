import { Configuration } from '../core/configuration'
import { Logger } from '../core/logger'
import { monitor } from '../core/monitoring'
import { report, StackTrace } from '../tracekit/tracekit'

export function errorCollectionModule(configuration: Configuration, logger: Logger) {
  if (configuration.isCollectingError) {
    startConsoleTracking(logger)
    startRuntimeErrorTracking(logger)
    trackXhrError(logger)
  }
}

let originalConsoleError: (message?: any, ...optionalParams: any[]) => void

export function startConsoleTracking(logger: Logger) {
  originalConsoleError = console.error
  console.error = (message?: any, ...optionalParams: any[]) => {
    originalConsoleError.apply(console, [message, ...optionalParams])
    logger.error([message, ...optionalParams].join(' '))
  }
}

export function stopConsoleTracking() {
  console.error = originalConsoleError
}

let traceKitReporthandler: (stack: StackTrace) => void

export function startRuntimeErrorTracking(logger: Logger) {
  traceKitReporthandler = (stack: StackTrace) => logger.error(stack.message, stack)
  report.subscribe(traceKitReporthandler)
}

export function stopRuntimeErrorTracking() {
  report.unsubscribe(traceKitReporthandler)
}

interface XhrInfo {
  method?: string
  url?: string
  status?: number
  statusText?: string
}

export function trackXhrError(logger: Logger) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method: string, url: string) {
    const xhrInfo: XhrInfo = {}
    // tslint:disable-next-line no-this-assignment
    const xhr = this

    xhrInfo.method = method
    xhrInfo.url = url

    xhr.addEventListener(
      'load',
      monitor(() => {
        if (xhr.status < 200 || xhr.status >= 400) {
          reportXhrError()
        }
      })
    )
    xhr.addEventListener('error', monitor(reportXhrError))

    function reportXhrError() {
      xhrInfo.status = xhr.status
      xhrInfo.statusText = xhr.status === 0 ? 'Network Error' : xhr.statusText
      logger.error('XHR error', { xhr: xhrInfo })
    }

    return originalOpen.apply(this, arguments as any)
  }
}
