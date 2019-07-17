import { Handler, report, StackFrame, StackTrace } from '../tracekit/tracekit'
import { Configuration } from './configuration'
import { Observable } from './observable'
import { isRejected, isServerError, RequestDetails, RequestObservable, RequestType } from './requestCollection'
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

export function startErrorCollection(configuration: Configuration, requestObservable: RequestObservable) {
  const errorObservable = new Observable<ErrorMessage>()
  if (configuration.isCollectingError) {
    startConsoleTracking(errorObservable)
    startRuntimeErrorTracking(errorObservable)
    trackNetworkError(configuration, errorObservable, requestObservable)
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
      message: ['console error:', message, ...optionalParams].map(formatConsoleParameters).join(' '),
    })
  }
}

export function stopConsoleTracking() {
  console.error = originalConsoleError
}

function formatConsoleParameters(param: unknown) {
  if (typeof param === 'string') {
    return param
  }
  if (param instanceof Error) {
    return param.toString()
  }
  return jsonStringify(param as object, undefined, 2)
}

let traceKitReportHandler: (stack: StackTrace, isWindowError: boolean, errorObject?: any) => void

export function startRuntimeErrorTracking(errorObservable: ErrorObservable) {
  traceKitReportHandler = (stack: StackTrace, _: boolean, errorObject?: any) => {
    errorObservable.notify(formatRuntimeError(stack, errorObject))
  }
  ;(report.subscribe as (handler: Handler) => void)(traceKitReportHandler)
}

export function stopRuntimeErrorTracking() {
  ;(report.unsubscribe as (handler: Handler) => void)(traceKitReportHandler)
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

export function trackNetworkError(
  configuration: Configuration,
  errorObservable: ErrorObservable,
  requestObservable: RequestObservable
) {
  requestObservable.subscribe((request: RequestDetails) => {
    if (isRejected(request) || isServerError(request)) {
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
        message: `${format(request.type)} error ${request.method} ${request.url}`,
      })
    }
  })
}

function truncateResponse(response: string | undefined, configuration: Configuration) {
  if (response && response.length > configuration.requestErrorResponseLengthLimit) {
    return `${response.substring(0, configuration.requestErrorResponseLengthLimit)}...`
  }
  return response
}

function format(type: RequestType) {
  if (RequestType.XHR === type) {
    return 'XHR'
  }
  return 'Fetch'
}
