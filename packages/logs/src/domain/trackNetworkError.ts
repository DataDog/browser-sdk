import {
  ErrorSource,
  FetchCompleteContext,
  initXhrObservable,
  Observable,
  RawError,
  RequestType,
  initFetchObservable,
  XhrCompleteContext,
  computeStackTrace,
  toStackTraceString,
  monitor,
} from '@datadog/browser-core'
import { LogsConfiguration } from './configuration'

export function trackNetworkError(configuration: LogsConfiguration, errorObservable: Observable<RawError>) {
  const xhrSubscription = initXhrObservable().subscribe((context) => {
    if (context.state === 'complete') {
      handleCompleteRequest(RequestType.XHR, context)
    }
  })
  const fetchSubscription = initFetchObservable().subscribe((context) => {
    if (context.state === 'complete') {
      handleCompleteRequest(RequestType.FETCH, context)
    }
  })

  function handleCompleteRequest(type: RequestType, request: XhrCompleteContext | FetchCompleteContext) {
    if (!configuration.isIntakeUrl(request.url) && (isRejected(request) || isServerError(request))) {
      if ('xhr' in request) {
        onResponseDataAvailable(computeXhrResponseData(request.xhr, configuration))
      } else if (request.response) {
        computeFetchResponseText(request.response, configuration, onResponseDataAvailable)
      } else if (request.error) {
        onResponseDataAvailable(computeFetchErrorText(request.error, configuration))
      }
    }

    function onResponseDataAvailable(responseData: any) {
      errorObservable.notify({
        message: `${format(type)} error ${request.method} ${request.url}`,
        resource: {
          method: request.method,
          statusCode: request.status,
          url: request.url,
        },
        source: ErrorSource.NETWORK,
        stack: responseData || 'Failed to load',
        startClocks: request.startClocks,
      })
    }
  }

  return {
    stop: () => {
      xhrSubscription.unsubscribe()
      fetchSubscription.unsubscribe()
    },
  }
}

// TODO: ideally, computeXhrResponseData should always return a string instead of `any`. But to keep
// backward compatibility, in the case of XHR with a `responseType` different than "text", the
// response data should be whatever `xhr.response` is. This is a bit confusing as Logs event 'stack'
// is expected to be a string. This should be changed in a future major version as it could be a
// breaking change.
export function computeXhrResponseData(xhr: XMLHttpRequest, configuration: LogsConfiguration): any {
  if (typeof xhr.response === 'string') {
    return truncateResponseText(xhr.response, configuration)
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return xhr.response
}

export function computeFetchErrorText(error: Error, configuration: LogsConfiguration) {
  return truncateResponseText(toStackTraceString(computeStackTrace(error)), configuration)
}

export function computeFetchResponseText(
  response: Response,
  configuration: LogsConfiguration,
  callback: (responseText?: string) => void
) {
  response
    .clone()
    .text()
    .then(
      monitor((text) => callback(truncateResponseText(text, configuration))),
      monitor((error) => callback(`Unable to retrieve response: ${error as string}`))
    )
}

function isRejected(request: { status: number; responseType?: string }) {
  return request.status === 0 && request.responseType !== 'opaque'
}

function isServerError(request: { status: number }) {
  return request.status >= 500
}

function truncateResponseText(responseText: string, configuration: LogsConfiguration) {
  if (responseText.length > configuration.requestErrorResponseLengthLimit) {
    return `${responseText.substring(0, configuration.requestErrorResponseLengthLimit)}...`
  }
  return responseText
}

function format(type: RequestType) {
  if (RequestType.XHR === type) {
    return 'XHR'
  }
  return 'Fetch'
}
