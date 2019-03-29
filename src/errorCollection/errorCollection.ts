import { Configuration } from '../core/configuration'
import { Logger } from '../core/logger'
import { monitor } from '../core/monitoring'
import { report, StackTrace } from '../tracekit/tracekit'

export function startErrorCollection(configuration: Configuration, logger: Logger) {
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

export function formatStackTraceToContext(stack: StackTrace) {
  return {
    error: {
      kind: stack.name,
      stack: JSON.stringify(stack.stack, undefined, 2),
    },
  }
}

let traceKitReporthandler: (stack: StackTrace) => void

export function startRuntimeErrorTracking(logger: Logger) {
  traceKitReporthandler = (stack: StackTrace) => logger.error(stack.message, formatStackTraceToContext(stack))
  report.subscribe(traceKitReporthandler)
}

export function stopRuntimeErrorTracking() {
  report.unsubscribe(traceKitReporthandler)
}

interface XhrInfo {
  method: string
  url: string
  status: number
}

export function trackXhrError(logger: Logger) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method: string, url: string) {
    const reportXhrError = () => {
      if (this.status === 0 || this.status >= 500) {
        const xhrInfo: XhrInfo = { method, url, status: this.status }
        logger.error(`XHR error ${url}`, { xhr: xhrInfo })
      }
    }

    this.addEventListener('load', monitor(reportXhrError))
    this.addEventListener('error', monitor(reportXhrError))

    return originalOpen.apply(this, arguments as any)
  }
}
