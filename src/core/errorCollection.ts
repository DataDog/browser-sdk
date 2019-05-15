import { report, StackTrace } from '../tracekit/tracekit'
import { Configuration } from './configuration'
import { Context } from './context'
import { monitor } from './internalMonitoring'
import { Observable } from './observable'

export interface ErrorMessage {
  message: string
  context?: Context
}

export type ErrorObservable = Observable<ErrorMessage>

export function startErrorCollection(configuration: Configuration) {
  const errorObservable = new Observable<ErrorMessage>()
  if (configuration.isCollectingError) {
    startConsoleTracking(errorObservable)
    startRuntimeErrorTracking(errorObservable)
    trackXhrError(errorObservable)
  }
  return errorObservable
}

let originalConsoleError: (message?: any, ...optionalParams: any[]) => void

export function startConsoleTracking(errorObservable: ErrorObservable) {
  originalConsoleError = console.error
  console.error = (message?: any, ...optionalParams: any[]) => {
    originalConsoleError.apply(console, [message, ...optionalParams])
    errorObservable.notify({ message: [message, ...optionalParams].join(' ') })
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

export function startRuntimeErrorTracking(errorObservable: ErrorObservable) {
  traceKitReportHandler = (stack: StackTrace) =>
    errorObservable.notify({ message: stack.message, context: formatStackTraceToContext(stack) })
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

export function trackXhrError(errorObservable: ErrorObservable) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method: string, url: string) {
    const reportXhrError = () => {
      if (this.status === 0 || this.status >= 500) {
        const xhrInfo: XhrInfo = { method, url, status: this.status }
        errorObservable.notify({ message: `XHR error ${url}`, context: { xhr: xhrInfo } })
      }
    }

    this.addEventListener('load', monitor(reportXhrError))
    this.addEventListener('error', monitor(reportXhrError))

    return originalOpen.apply(this, arguments as any)
  }
}
