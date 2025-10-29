import type { FetchResolveContext, XhrCompleteContext } from '@datadog/browser-core'
import {
  isWorkerEnvironment,
  Observable,
  ErrorSource,
  initXhrObservable,
  RequestType,
  initFetchObservable,
  computeStackTrace,
  toStackTraceString,
  noop,
  readResponseBody,
  isServerError,
  isIntakeUrl,
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

  // XHR is not available in web workers, so we use an empty observable that never emits
  const xhrSubscription = (
    isWorkerEnvironment ? new Observable<XhrCompleteContext>() : initXhrObservable(configuration)
  ).subscribe((context) => {
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
    if (!isIntakeUrl(request.url) && (isRejected(request) || isServerError(request.status))) {
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
            // We don't know if the error was handled or not, so we set it to undefined
            handling: undefined,
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
  readResponseBody(
    { xhr } as any,
    (result) => {
      callback(result.body)
    },
    { bytesLimit: configuration.requestErrorResponseLengthLimit }
  )
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
  readResponseBody(
    { response } as any,
    (result) => {
      if (result.error) {
        callback(`Unable to retrieve response: ${result.error as unknown as string}`)
      } else if (typeof result.body === 'string') {
        callback(result.body)
      } else {
        callback()
      }
    },
    { bytesLimit: configuration.requestErrorResponseLengthLimit }
  )
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
