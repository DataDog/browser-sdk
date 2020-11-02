import { FetchCompleteContext, resetFetchProxy, startFetchProxy } from '../browser/fetchProxy'
import { resetXhrProxy, startXhrProxy, XhrCompleteContext } from '../browser/xhrProxy'
import { Observable } from '../tools/observable'
import { jsonStringify, ONE_MINUTE, RequestType } from '../tools/utils'
import { Configuration, isIntakeRequest } from './configuration'
import { monitor } from './internalMonitoring'
import { computeStackTrace, Handler, report, StackFrame, StackTrace } from './tracekit'

export interface RawError {
  startTime: number
  message: string
  type?: string
  stack?: string
  source: ErrorSource
  resource?: {
    url: string
    statusCode: number
    method: string
  }
}

export enum ErrorSource {
  AGENT = 'agent',
  CONSOLE = 'console',
  NETWORK = 'network',
  SOURCE = 'source',
  LOGGER = 'logger',
  CUSTOM = 'custom',
}

export type ErrorObservable = Observable<RawError>
let filteredErrorsObservable: ErrorObservable

export function startAutomaticErrorCollection(configuration: Configuration) {
  if (!filteredErrorsObservable) {
    const errorObservable = new Observable<RawError>()
    trackNetworkError(configuration, errorObservable)
    startConsoleTracking(errorObservable)
    startRuntimeErrorTracking(errorObservable)
    filteredErrorsObservable = filterErrors(configuration, errorObservable)
  }
  return filteredErrorsObservable
}

export function filterErrors(configuration: Configuration, errorObservable: Observable<RawError>) {
  let errorCount = 0
  const filteredErrorObservable = new Observable<RawError>()
  errorObservable.subscribe((error: RawError) => {
    if (errorCount < configuration.maxErrorsByMinute) {
      errorCount += 1
      filteredErrorObservable.notify(error)
    } else if (errorCount === configuration.maxErrorsByMinute) {
      errorCount += 1
      filteredErrorObservable.notify({
        message: `Reached max number of errors by minute: ${configuration.maxErrorsByMinute}`,
        source: ErrorSource.AGENT,
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
      message: ['console error:', message, ...optionalParams].map(formatConsoleParameters).join(' '),
      source: ErrorSource.CONSOLE,
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
  traceKitReportHandler = (stackTrace: StackTrace, _: boolean, errorObject?: any) => {
    const { stack, message, type } = formatUnknownError(stackTrace, errorObject, 'Uncaught')
    errorObservable.notify({
      message,
      stack,
      type,
      source: ErrorSource.SOURCE,
      startTime: performance.now(),
    })
  }
  ;(report.subscribe as (handler: Handler) => void)(traceKitReportHandler)
}

export function stopRuntimeErrorTracking() {
  ;(report.unsubscribe as (handler: Handler) => void)(traceKitReportHandler)
}

export function formatUnknownError(stackTrace: StackTrace | undefined, errorObject: any, nonErrorPrefix: string) {
  if (!stackTrace || (stackTrace.message === undefined && !(errorObject instanceof Error))) {
    return {
      message: `${nonErrorPrefix} ${jsonStringify(errorObject)}`,
      stack: 'No stack, consider using an instance of Error',
      type: stackTrace && stackTrace.name,
    }
  }

  return {
    message: stackTrace.message || 'Empty message',
    stack: toStackTraceString(stackTrace),
    type: stackTrace.name,
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
        message: `${format(type)} error ${request.method} ${request.url}`,
        resource: {
          method: request.method,
          statusCode: request.status,
          url: request.url,
        },
        source: ErrorSource.NETWORK,
        stack: truncateResponse(request.response, configuration) || 'Failed to load',
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
