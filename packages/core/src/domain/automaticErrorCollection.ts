import { FetchCompleteContext, resetFetchProxy, startFetchProxy, FetchStartContext } from '../browser/fetchProxy'
import { resetXhrProxy, startXhrProxy, XhrCompleteContext, XhrStartContext } from '../browser/xhrProxy'
import { ErrorSource, formatUnknownError, RawError, toStackTraceString, formatErrorMessage } from '../tools/error'
import { Observable } from '../tools/observable'
import { clocksNow } from '../tools/timeUtils'
import { jsonStringify, ONE_MINUTE, RequestType, find } from '../tools/utils'
import { Configuration } from './configuration'
import { monitor } from './internalMonitoring'
import { computeStackTrace, subscribe, unsubscribe, StackTrace } from './tracekit'

export type ErrorObservable = Observable<RawError>
let filteredErrorsObservable: ErrorObservable

export function startAutomaticErrorCollection(configuration: Configuration) {
  if (!filteredErrorsObservable) {
    const errorObservable = new Observable<RawError>()
    trackNetworkError(configuration, errorObservable)
    startConsoleTracking(configuration, errorObservable)
    startRuntimeErrorTracking(configuration, errorObservable)
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
        startClocks: clocksNow(),
        startFocused: configuration.isEnabled('track-focus') ? document.hasFocus() : undefined,
      })
    }
  })
  setInterval(() => (errorCount = 0), ONE_MINUTE)
  return filteredErrorObservable
}

let originalConsoleError: (...params: unknown[]) => void

export function startConsoleTracking(configuration: Configuration, errorObservable: ErrorObservable) {
  originalConsoleError = console.error
  console.error = monitor((...params: unknown[]) => {
    originalConsoleError.apply(console, params)
    errorObservable.notify({
      ...buildErrorFromParams(params),
      source: ErrorSource.CONSOLE,
      startClocks: clocksNow(),
      startFocused: configuration.isEnabled('track-focus') ? document.hasFocus() : undefined,
    })
  })
}

function buildErrorFromParams(params: unknown[]) {
  const firstErrorParam = find(params, (param: unknown): param is Error => param instanceof Error)
  return {
    message: ['console error:', ...params].map((param) => formatConsoleParameters(param)).join(' '),
    stack: firstErrorParam ? toStackTraceString(computeStackTrace(firstErrorParam)) : undefined,
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
    return formatErrorMessage(computeStackTrace(param))
  }
  return jsonStringify(param, undefined, 2)
}

let traceKitReportHandler: (stack: StackTrace, isWindowError: boolean, errorObject?: any) => void

export function startRuntimeErrorTracking(configuration: Configuration, errorObservable: ErrorObservable) {
  traceKitReportHandler = (stackTrace: StackTrace, _: boolean, errorObject?: any) => {
    const { stack, message, type } = formatUnknownError(stackTrace, errorObject, 'Uncaught')
    const error: RawError = {
      message,
      stack,
      type,
      source: ErrorSource.SOURCE,
      startClocks: clocksNow(),
    }
    if (configuration.isEnabled('track-focus')) {
      error.startFocused = document.hasFocus()
    }
    errorObservable.notify(error)
  }
  subscribe(traceKitReportHandler)
}

export function stopRuntimeErrorTracking() {
  unsubscribe(traceKitReportHandler)
}

export function trackNetworkError(configuration: Configuration, errorObservable: ErrorObservable) {
  const xhrProxy = startXhrProxy()
  xhrProxy.beforeSend(addFocusToContext)
  xhrProxy.onRequestComplete((context) => handleCompleteRequest(RequestType.XHR, context))

  const fetchProxy = startFetchProxy()
  fetchProxy.beforeSend(addFocusToContext)
  fetchProxy.onRequestComplete((context) => handleCompleteRequest(RequestType.FETCH, context))

  function handleCompleteRequest(type: RequestType, request: XhrCompleteContext | FetchCompleteContext) {
    if (
      !configuration.isIntakeUrl(request.url) &&
      (!configuration.isEnabled('remove-network-errors') || !request.isAborted) &&
      (isRejected(request) || isServerError(request))
    ) {
      errorObservable.notify({
        message: `${format(type)} error ${request.method} ${request.url}`,
        resource: {
          method: request.method,
          statusCode: request.status,
          url: request.url,
        },
        source: ErrorSource.NETWORK,
        stack: truncateResponse(request.response, configuration) || 'Failed to load',
        startClocks: request.startClocks,
        startFocused: request.startFocused as boolean | undefined,
      })
    }
  }

  function addFocusToContext(context: XhrStartContext | FetchStartContext) {
    context.startFocused = configuration.isEnabled('track-focus') ? document.hasFocus() : undefined
  }

  return {
    stop: () => {
      resetXhrProxy()
      resetFetchProxy()
    },
  }
}

function isRejected(request: { status: number; responseType?: string }) {
  return request.status === 0 && request.responseType !== 'opaque'
}

function isServerError(request: { status: number }) {
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
