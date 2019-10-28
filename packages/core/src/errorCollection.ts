import { Configuration } from './configuration'
import { monitor } from './internalMonitoring'
import { ErrorMessage, ErrorOrigin, MessageObservable, MessageType, RequestType } from './messages'
import { Observable } from './observable'
import { isRejected, isServerError, startRequestCollection } from './requestCollection'
import { computeStackTrace, Handler, report, StackFrame, StackTrace } from './tracekit'
import { jsonStringify, ONE_MINUTE } from './utils'

type ErrorObservable = Observable<ErrorMessage>

export function startErrorCollection(configuration: Configuration, messageObservable: MessageObservable) {
  if (configuration.isCollectingError) {
    const errorObservable = new Observable<ErrorMessage>()
    startRequestCollection(messageObservable)
    trackNetworkError(configuration, messageObservable, errorObservable)
    startConsoleTracking(errorObservable)
    startRuntimeErrorTracking(errorObservable)
    filterErrors(configuration, messageObservable, errorObservable)
  }
}

export function filterErrors(
  configuration: Configuration,
  messageObservable: MessageObservable,
  errorObservable: ErrorObservable
) {
  let errorCount = 0
  errorObservable.subscribe((error: ErrorMessage) => {
    if (errorCount < configuration.maxErrorsByMinute) {
      errorCount += 1
      messageObservable.notify(error)
    } else if (errorCount === configuration.maxErrorsByMinute) {
      errorCount += 1
      messageObservable.notify({
        context: {
          error: {
            origin: ErrorOrigin.AGENT,
          },
        },
        message: `Reached max number of errors by minute: ${configuration.maxErrorsByMinute}`,
        type: MessageType.error,
      })
    }
  })
  setInterval(() => (errorCount = 0), ONE_MINUTE)
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
      type: MessageType.error,
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

export function formatRuntimeError(stackTrace: StackTrace, errorObject: any): ErrorMessage {
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
    type: MessageType.error,
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
  messageObservable: MessageObservable,
  errorObservable: ErrorObservable
) {
  messageObservable.subscribe((message) => {
    if (message.type === MessageType.request && (isRejected(message) || isServerError(message))) {
      errorObservable.notify({
        context: {
          error: {
            origin: ErrorOrigin.NETWORK,
            stack: truncateResponse(message.response, configuration) || 'Failed to load',
          },
          http: {
            method: message.method,
            status_code: message.status,
            url: message.url,
          },
        },
        message: `${format(message.requestType)} error ${message.method} ${message.url}`,
        type: MessageType.error,
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
