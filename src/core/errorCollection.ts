import { report, StackFrame, StackTrace } from '../tracekit/tracekit'
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
    trackFetchError(errorObservable)
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
      stack: toStackTraceString(stack),
    },
  }
}

function toStackTraceString(stack: StackTrace) {
  let result = `${stack.name || 'Error'}: ${stack.message}`
  stack.stack.forEach((frame: StackFrame) => {
    const func = frame.func === '?' ? '<anonymous>' : frame.func
    const args = frame.args && frame.args.length > 0 ? `(${frame.args.join(', ')})` : ''
    const line = frame.line ? `:${frame.line}` : ''
    const column = frame.line && frame.column ? `:${frame.column}` : ''
    result += `\n  at ${func}${args} @ ${frame.url}${line}${column}`
  })
  return result
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

interface RequestDetails {
  method: string
  url: string
  status: number
  response?: string
}

export function trackXhrError(errorObservable: ErrorObservable) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method: string, url: string) {
    const reportXhrError = () => {
      if (this.status === 0 || this.status >= 500) {
        notifyError(errorObservable, 'XHR', { method, url, status: this.status, response: this.response })
      }
    }

    this.addEventListener('load', monitor(reportXhrError))
    this.addEventListener('error', monitor(reportXhrError))

    return originalOpen.apply(this, arguments as any)
  }
}

export function trackFetchError(errorObservable: ErrorObservable) {
  const originalFetch = window.fetch
  window.fetch = async function(input: RequestInfo, init?: RequestInit) {
    const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
    const reportFetchError = async (response: Response | Error) => {
      if ('stack' in response) {
        const url = (typeof input === 'object' && input.url) || (input as string)
        notifyError(errorObservable, 'Fetch', { method, url, response: response.stack, status: 0 })
      } else if ('status' in response && response.status >= 500) {
        const text = await response.clone().text()
        notifyError(errorObservable, 'Fetch', {
          method,
          response: text,
          status: response.status,
          url: response.url,
        })
      }
    }
    const responsePromise = originalFetch.call(this, input, init)
    responsePromise.then(monitor(reportFetchError)).catch(monitor(reportFetchError))
    return responsePromise
  }
}

function notifyError(errorObservable: ErrorObservable, type: string, request: RequestDetails) {
  errorObservable.notify({
    context: {
      error: {
        stack: request.response || 'Failed to load',
      },
      http: {
        method: request.method,
        status_code: request.status,
        url: request.url,
      },
    },
    message: `${type} error ${request.method} ${request.url}`,
  })
}
