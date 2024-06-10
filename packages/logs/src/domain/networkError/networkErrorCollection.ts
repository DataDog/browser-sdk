import type { FetchResolveContext, XhrCompleteContext } from '@datadog/browser-core'
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
  tryToClone,
  isServerError,
} from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import type { LogsEventDomainContext } from '../../domainContext.types'
import { LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger/isAuthorized'

export function startNetworkErrorCollection(configuration: LogsConfiguration, lifeCycle: LifeCycle) {
  if (!configuration.forwardErrorsToLogs) {
    return { stop: noop }
  }

  const xhrSubscription = initXhrObservable(configuration).subscribe((context) => {
    if (context.state === 'complete') {
      handleResponse(RequestType.XHR, context)
    }
  })
  const fetchSubscription = initFetchObservable().subscribe((context) => {
    if (context.state === 'resolve') {
      handleResponse(RequestType.FETCH, context)
    }
  })

  function handleResponse(type: RequestType, request: XhrCompleteContext | FetchResolveContext) {
    if (!configuration.isIntakeUrl(request.url) && (isRejected(request) || isServerError(request.status))) {
      if ('xhr' in request) {
        computeXhrResponseData(request.xhr, configuration, onResponseDataAvailable)
      } else if (request.response) {
        computeFetchResponseText(request.response, configuration, onResponseDataAvailable)
      } else if (request.error) {
        computeFetchErrorText(request.error, configuration, onResponseDataAvailable)
      }
    }

    function onResponseDataAvailable(responseData: unknown) {
      const domainContext: LogsEventDomainContext<typeof ErrorSource.NETWORK> = {
        isAborted: request.isAborted,
        handlingStack: request.handlingStack,
      }

      lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
        rawLogsEvent: {
          message: `${format(type)} error ${request.method} ${request.url}`,
          date: request.startClocks.timeStamp,
          error: {
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
        domainContext,
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
  const clonedResponse = tryToClone(response)
  if (!clonedResponse || !clonedResponse.body) {
    // if the clone failed or if the body is null, let's not try to read it.
    callback()
  } else if (!window.TextDecoder) {
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
    clonedResponse.text().then(
      monitor((text) => callback(truncateResponseText(text, configuration))),
      monitor((error) => callback(`Unable to retrieve response: ${error as string}`))
    )
  } else {
    truncateResponseStream(
      clonedResponse.body,
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
  bytesLimit: number,
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
      bytesLimit,
      collectStreamBody: true,
    }
  )
}
