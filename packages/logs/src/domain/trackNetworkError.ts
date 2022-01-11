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
      computeResponseData(request, configuration, (responseData) => {
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

// TODO: ideally, computeResponseData should always call the `callback` with a string instead of
// `any`. But to keep retrocompatibility, in the case of XHR with a `responseType` different than
// "text", the response data should be whatever `xhr.response` is. This is a bit confusing as Logs
// event 'stack' is expected to be a string. This should be changed in a future major version as it
// could be a breaking change.
export function computeResponseData(
  { xhr, response, error }: { xhr?: XMLHttpRequest; response?: Response; error?: unknown },
  configuration: LogsConfiguration,
  callback: (responseData?: any) => void
) {
  if (xhr) {
    if (typeof xhr.response === 'string') {
      callback(truncateResponseText(xhr.response, configuration))
    } else {
      callback(xhr.response)
    }
  } else if (response) {
    response
      .clone()
      .text()
      .then(
        (text) => callback(text),
        (error) => callback(`Unable to retrieve response: ${error as string}`)
      )
  } else if (error) {
    callback(truncateResponseText(toStackTraceString(computeStackTrace(error)), configuration))
  } else {
    // This case should not happen in practice, but better safe than sorry.
    callback()
  }
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
