import type { FetchCompleteContext, XhrCompleteContext } from '@datadog/browser-core'
import {
  ErrorSource,
  initXhrObservable,
  RequestType,
  initFetchObservable,
  computeStackTrace,
  toStackTraceString,
  monitor,
  noop,
  readBytesFromStream,
} from '@datadog/browser-core'
import type { RawNetworkLogsEvent } from '../../../rawLogsEvent.types'
import type { LogsConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { StatusType } from '../../logger'

export function startNetworkErrorCollection(configuration: LogsConfiguration, lifeCycle: LifeCycle) {
  if (!configuration.forwardErrorsToLogs) {
    return { stop: noop }
  }

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
        computeXhrResponseData(request.xhr, configuration, onResponseDataAvailable)
      } else if (request.response) {
        computeFetchResponseText(request.response, configuration, onResponseDataAvailable)
      } else if (request.error) {
        computeFetchErrorText(request.error, configuration, onResponseDataAvailable)
      }
    }

    function onResponseDataAvailable(responseData: unknown) {
      lifeCycle.notify<RawNetworkLogsEvent>(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: {
          message: `${format(type)} error ${request.method} ${request.url}`,
          date: request.startClocks.timeStamp,
          error: {
            origin: ErrorSource.NETWORK, // Todo: Remove in the next major release
            stack: (responseData as string) || 'Failed to load',
          },
          http: {
            method: request.method as any, // Cast resource method because of case mismatch cf issue RUMF-1152
            status_code: request.status,
            url: request.url,
          },
          status: StatusType.error,
          origin: ErrorSource.NETWORK,
        },
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

// TODO: ideally, computeXhrResponseData should always call the callback with a string instead of
// `unknown`. But to keep backward compatibility, in the case of XHR with a `responseType` different
// than "text", the response data should be whatever `xhr.response` is. This is a bit confusing as
// Logs event 'stack' is expected to be a string. This should be changed in a future major version
// as it could be a breaking change.
export function computeXhrResponseData(
  xhr: XMLHttpRequest,
  configuration: LogsConfiguration,
  callback: (responseData: unknown) => void
) {
  if (typeof xhr.response === 'string') {
    callback(truncateResponseText(xhr.response, configuration))
  } else {
    callback(xhr.response)
  }
}

export function computeFetchErrorText(
  error: Error,
  configuration: LogsConfiguration,
  callback: (errorText: string) => void
) {
  callback(truncateResponseText(toStackTraceString(computeStackTrace(error)), configuration))
}

export function computeFetchResponseText(
  response: Response,
  configuration: LogsConfiguration,
  callback: (responseText?: string) => void
) {
  if (!window.TextDecoder) {
    // If the browser doesn't support TextDecoder, let's read the whole response then truncate it.
    //
    // This should only be the case on early versions of Edge (before they migrated to Chromium).
    // Even if it could be possible to implement a workaround for the missing TextDecoder API (using
    // a Blob and FileReader), we found another issue preventing us from reading only the first
    // bytes from the response: contrary to other browsers, when reading from the cloned response,
    // if the original response gets canceled, the cloned response is also canceled and we can't
    // know about it.  In the following illustration, the promise returned by `reader.read()` may
    // never be fulfilled:
    //
    // fetch('/').then((response) => {
    //   const reader = response.clone().body.getReader()
    //   readMore()
    //   function readMore() {
    //     reader.read().then(
    //       (result) => {
    //         if (result.done) {
    //           console.log('done')
    //         } else {
    //           readMore()
    //         }
    //       },
    //       () => console.log('error')
    //     )
    //   }
    //   response.body.getReader().cancel()
    // })
    response
      .clone()
      .text()
      .then(
        monitor((text) => callback(truncateResponseText(text, configuration))),
        monitor((error) => callback(`Unable to retrieve response: ${error as string}`))
      )
  } else if (!response.body) {
    callback()
  } else {
    truncateResponseStream(
      response.clone().body!,
      configuration.requestErrorResponseLengthLimit,
      (error, responseText) => {
        if (error) {
          callback(`Unable to retrieve response: ${error as unknown as string}`)
        } else {
          callback(responseText)
        }
      }
    )
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

function truncateResponseStream(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  callback: (error?: Error, responseText?: string) => void
) {
  readBytesFromStream(
    stream,
    (error, bytes, limitExceeded) => {
      if (error) {
        callback(error)
      } else {
        let responseText = new TextDecoder().decode(bytes)
        if (limitExceeded) {
          responseText += '...'
        }
        callback(undefined, responseText)
      }
    },
    {
      limit,
      collectStreamBody: true,
    }
  )
}
