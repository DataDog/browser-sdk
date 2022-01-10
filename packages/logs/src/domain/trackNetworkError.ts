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
  noop,
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
        computeXhrResponseData(request.xhr, configuration, onResponseDataAvailable)
      } else if (request.response) {
        computeFetchResponseText(request.response, configuration, onResponseDataAvailable)
      } else if (request.error) {
        computeFetchErrorText(request.error, configuration, onResponseDataAvailable)
      }
    }

    function onResponseDataAvailable(responseData: unknown) {
      errorObservable.notify({
        message: `${format(type)} error ${request.method} ${request.url}`,
        resource: {
          method: request.method,
          statusCode: request.status,
          url: request.url,
        },
        source: ErrorSource.NETWORK,
        stack: (responseData as string) || 'Failed to load',
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
  if (!response.body) {
    callback()
  } else {
    readBytes(
      response.clone().body!,
      // Read one more byte than the limit, so we can check if more bytes would be available and
      // show an ellipsis in this case
      configuration.requestErrorResponseLengthLimit + 1,
      (error, bytes) => {
        if (error) {
          callback(`Unable to retrieve response: ${(error as unknown) as string}`)
        } else {
          let responseText = new TextDecoder().decode(bytes!.slice(0, configuration.requestErrorResponseLengthLimit))
          if (bytes!.length > configuration.requestErrorResponseLengthLimit) {
            responseText += '...'
          }
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

/**
 * Read bytes from a ReadableStream until `limit` bytes have been read.
 */
function readBytes(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  callback: (error?: Error, bytes?: Uint8Array) => void
) {
  const reader = stream.getReader()
  const partialBuffers: Uint8Array[] = []
  let readBytesCount = 0

  readMore()

  function readMore() {
    reader.read().then(
      monitor((result: ReadableStreamReadResult<Uint8Array>) => {
        if (result.done) {
          onDone()
          return
        }

        partialBuffers.push(result.value)
        readBytesCount += result.value.length

        if (readBytesCount >= limit) {
          onDone()
        } else {
          readMore()
        }
      }),
      monitor((error) => callback(error))
    )
  }

  function onDone() {
    reader.cancel().catch(
      // we don't care if cancel fails, but we still need to catch the error to avoid reporting it
      // as an unhandled rejection
      noop
    )

    if (partialBuffers.length === 1) {
      // if the response is small enough to fit in a single buffer (provided by the browser), just
      // use it directly.
      callback(undefined, partialBuffers[0])
    } else {
      // else, we need to copy buffers into a larger buffer to concatenate them.
      const completeBuffer = new Uint8Array(readBytesCount)
      let offset = 0
      partialBuffers.forEach((partialBuffer) => {
        completeBuffer.set(
          // make sure it does not overflow the buffer
          partialBuffer.slice(0, limit - offset),
          offset
        )
        offset += partialBuffer.length
      })

      callback(undefined, completeBuffer)
    }
  }
}
