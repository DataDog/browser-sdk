import { Handler, report, StackFrame, StackTrace } from '../tracekit/tracekit'
import { Configuration } from './configuration'
import { monitor } from './internalMonitoring'
import { Observable } from './observable'
import { jsonStringify, ONE_MINUTE } from './utils'

export interface ErrorMessage {
  message: string
  context: {
    error: ErrorContext
    http?: HttpContext
  }
}

export interface ErrorContext {
  kind?: string
  stack?: string
  origin: ErrorOrigin
}

export interface HttpContext {
  url: string
  status_code: number
  method: string
}

export enum ErrorOrigin {
  AGENT = 'agent',
  CONSOLE = 'console',
  NETWORK = 'network',
  SOURCE = 'source',
  LOGGER = 'logger',
}

export type ErrorObservable = Observable<ErrorMessage>

export function startErrorCollection(configuration: Configuration) {
  const errorObservable = new Observable<ErrorMessage>()
  if (configuration.isCollectingError) {
    startConsoleTracking(errorObservable)
    startRuntimeErrorTracking(errorObservable)
    trackXhrError(configuration, errorObservable)
    trackFetchError(configuration, errorObservable)
  }
  return filterErrors(configuration, errorObservable)
}

export function filterErrors(configuration: Configuration, errorObservable: Observable<ErrorMessage>) {
  let errorCount = 0
  const filteredErrorObservable = new Observable<ErrorMessage>()
  errorObservable.subscribe((error: ErrorMessage) => {
    if (errorCount < configuration.maxErrorsByMinute) {
      errorCount += 1
      filteredErrorObservable.notify(error)
    } else if (errorCount === configuration.maxErrorsByMinute) {
      errorCount += 1
      filteredErrorObservable.notify({
        context: {
          error: {
            origin: ErrorOrigin.AGENT,
          },
        },
        message: `Reached max number of errors by minute: ${configuration.maxErrorsByMinute}`,
      })
    }
  })
  setInterval(() => (errorCount = 0), ONE_MINUTE)
  return filteredErrorObservable
}

let originalConsoleError: (message?: any, ...optionalParams: any[]) => void

export function startConsoleTracking(errorObservable: ErrorObservable) {
  originalConsoleError = console.error
  console.error = (message?: any, ...optionalParams: any[]) => {
    originalConsoleError.apply(console, [message, ...optionalParams])
    errorObservable.notify({
      context: {
        error: {
          origin: ErrorOrigin.CONSOLE,
        },
      },
      message: ['console error:', message, ...optionalParams]
        .map((param: unknown) => (typeof param === 'string' ? param : jsonStringify(param as object, undefined, 2)))
        .join(' '),
    })
  }
}

export function stopConsoleTracking() {
  console.error = originalConsoleError
}

let traceKitReportHandler: (stack: StackTrace, isWindowError: boolean, errorObject?: any) => void

export function startRuntimeErrorTracking(errorObservable: ErrorObservable) {
  traceKitReportHandler = (stack: StackTrace, _: boolean, errorObject?: any) => {
    errorObservable.notify(formatRuntimeError(stack, errorObject))
  }
  ;(report.subscribe as (handler: Handler) => void)(traceKitReportHandler)
}

export function stopRuntimeErrorTracking() {
  ;(report.subscribe as (handler: Handler) => void)(traceKitReportHandler)
}

export function formatRuntimeError(stackTrace: StackTrace, errorObject: any) {
  let message: string
  let stack: string
  if (stackTrace.message === undefined && !(errorObject instanceof Error)) {
    message = `Uncaught ${jsonStringify(errorObject as any)}`
    stack = 'No stack, consider using an instance of Error'
  } else {
    message = stackTrace.message || 'Empty message'
    stack = toStackTraceString(stackTrace)
  }
  return {
    message,
    context: {
      error: {
        stack,
        kind: stackTrace.name,
        origin: ErrorOrigin.SOURCE,
      },
    },
  }
}

export function toStackTraceString(stack: StackTrace) {
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

interface RequestDetails {
  method: string
  url: string
  status: number
  response?: string
}

export function trackXhrError(configuration: Configuration, errorObservable: ErrorObservable) {
  const originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method: string, url: string) {
    const reportXhrError = () => {
      if (this.status === 0 || this.status >= 500) {
        notifyError(configuration, errorObservable, 'XHR', {
          method,
          url,
          response: this.response as string | undefined,
          status: this.status,
        })
      }
    }

    this.addEventListener('load', monitor(reportXhrError))
    this.addEventListener('error', monitor(reportXhrError))

    return originalOpen.apply(this, arguments as any)
  }
}

export function trackFetchError(configuration: Configuration, errorObservable: ErrorObservable) {
  const originalFetch = window.fetch
  // tslint:disable promise-function-async
  window.fetch = function(input: RequestInfo, init?: RequestInit) {
    const method = (init && init.method) || (typeof input === 'object' && input.method) || 'GET'
    const reportFetchError = async (response: Response | Error) => {
      if ('stack' in response) {
        const url = (typeof input === 'object' && input.url) || (input as string)
        notifyError(configuration, errorObservable, 'Fetch', { method, url, response: response.stack, status: 0 })
      } else if ('status' in response && response.status >= 500) {
        const text = await response.clone().text()
        notifyError(configuration, errorObservable, 'Fetch', {
          method,
          response: text,
          status: response.status,
          url: response.url,
        })
      }
    }
    const responsePromise = originalFetch.call(this, input, init)
    responsePromise.then(monitor(reportFetchError), monitor(reportFetchError))
    return responsePromise
  }
}

function notifyError(
  configuration: Configuration,
  errorObservable: ErrorObservable,
  type: string,
  request: RequestDetails
) {
  errorObservable.notify({
    context: {
      error: {
        origin: ErrorOrigin.NETWORK,
        stack: truncateResponse(request.response, configuration) || 'Failed to load',
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

function truncateResponse(response: string | undefined, configuration: Configuration) {
  if (response && response.length > configuration.requestErrorResponseLengthLimit) {
    return `${response.substring(0, configuration.requestErrorResponseLengthLimit)}...`
  }
  return response
}
