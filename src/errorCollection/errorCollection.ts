import { Configuration } from '../core/configuration'
import { Context } from '../core/context'
import { Logger } from '../core/logger'
import { monitor } from '../core/monitoring'
import { Observable } from '../core/observable'
import { report, StackTrace } from '../tracekit/tracekit'

export interface ErrorMessage {
  message: string
  context?: Context
}

export type ErrorObservable = Observable<ErrorMessage>

export function startErrorCollection(configuration: Configuration, logger: Logger) {
  const errorObservable = new Observable<ErrorMessage>()
  if (configuration.isCollectingError) {
    errorObservable.subscribe((e: ErrorMessage) => logger.error(e.message, e.context))
    const notifyError = (e: ErrorMessage) => {
      errorObservable.notify(e)
    }
    startConsoleTracking(notifyError)
    startRuntimeErrorTracking(notifyError)
    trackXhrError(notifyError)
  }
  return errorObservable
}

let originalConsoleError: (message?: any, ...optionalParams: any[]) => void

export function startConsoleTracking(notifyError: (e: ErrorMessage) => any) {
  originalConsoleError = console.error
  console.error = (message?: any, ...optionalParams: any[]) => {
    originalConsoleError.apply(console, [message, ...optionalParams])
    notifyError({ message: [message, ...optionalParams].join(' ') })
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

let traceKitReportHandler: (stack: StackTrace) => void

export function startRuntimeErrorTracking(notifyError: (e: ErrorMessage) => any) {
  traceKitReportHandler = (stack: StackTrace) =>
    notifyError({ message: stack.message, context: formatStackTraceToContext(stack) })
  report.subscribe(traceKitReportHandler)
}

export function stopRuntimeErrorTracking() {
  report.unsubscribe(traceKitReportHandler)
}

interface XhrInfo {
  method: string
  url: string
  status: number
}

export function trackXhrError(notifyError: (e: ErrorMessage) => any) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method: string, url: string) {
    const reportXhrError = () => {
      if (this.status === 0 || this.status >= 500) {
        const xhrInfo: XhrInfo = { method, url, status: this.status }
        notifyError({ message: `XHR error ${url}`, context: { xhr: xhrInfo } })
      }
    }

    this.addEventListener('load', monitor(reportXhrError))
    this.addEventListener('error', monitor(reportXhrError))

    return originalOpen.apply(this, arguments as any)
  }
}
