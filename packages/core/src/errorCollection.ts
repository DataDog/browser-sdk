import { Configuration, isIntakeRequest } from './configuration'
import { FetchCompleteContext, resetFetchProxy, startFetchProxy } from './fetchProxy'
import { monitor } from './internalMonitoring'
import { Observable } from './observable'
import { computeStackTrace, Handler, report, StackFrame, StackTrace } from './tracekit'
import { jsonStringify, ONE_MINUTE, RequestType } from './utils'
import { resetXhrProxy, startXhrProxy, XhrCompleteContext } from './xhrProxy'

export interface ErrorMessage {
  startTime: number
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
let filteredErrorsObservable: ErrorObservable

export function startErrorCollection(configuration: Configuration) {
  if (!filteredErrorsObservable) {
    const errorObservable = new Observable<ErrorMessage>()
    trackNetworkError(configuration, errorObservable)
    startConsoleTracking(errorObservable)
    startRuntimeErrorTracking(errorObservable)
    filteredErrorsObservable = filterErrors(configuration, errorObservable)
  }
  return filteredErrorsObservable
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
        startTime: performance.now(),
      })
    }
  })
  setInterval(() => (errorCount = 0), ONE_MINUTE)
  return filteredErrorObservable
}

let originalConsoleError: (message?: any, ...optionalParams: any[]) => void

export function startConsoleTracking(errorObservable: ErrorObservable) {
  originalConsoleError = console.error
  console.error = monitor((message?: any, ...optionalParams: any[]) => {
    originalConsoleError.apply(console, [message, ...optionalParams])
    errorObservable.notify({
      context: {
        error: {
          origin: ErrorOrigin.CONSOLE,
        },
      },
      message: ['console error:', message, ...optionalParams].map(formatConsoleParameters).join(' '),
      startTime: performance.now(),
    })
  })
}

export function stopConsoleTracking() {
  console.error = originalConsoleError
}

function formatConsoleParameters(param: unknown) {
  if (typeof param === 'string') {
    return param
  }
  if (param instanceof Error) {
    return toStackTraceString(computeStackTrace(param))
  }
  return jsonStringify(param, undefined, 2)
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
    message = `Uncaught ${jsonStringify(errorObject)}`
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
    startTime: performance.now(),
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

export function trackNetworkError(configuration: Configuration, errorObservable: ErrorObservable) {
  startXhrProxy().onRequestComplete((context) => handleCompleteRequest(RequestType.XHR, context))
  startFetchProxy().onRequestComplete((context) => handleCompleteRequest(RequestType.FETCH, context))

  function handleCompleteRequest(type: RequestType, request: XhrCompleteContext | FetchCompleteContext) {
    if (!isIntakeRequest(request.url, configuration) && (isRejected(request) || isServerError(request))) {
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
        message: `${format(type)} error ${request.method} ${request.url}`,
        startTime: request.startTime,
      })
    }
  }

  return {
    stop() {
      resetXhrProxy()
      resetFetchProxy()
    },
  }
}

export function isRejected(request: { status: number; responseType?: string }) {
  return request.status === 0 && request.responseType !== 'opaque'
}

export function isServerError(request: { status: number }) {
  return request.status >= 500
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
