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
  isServerError,
  isIntakeUrl,
  ResponseBodyAction,
  safeTruncate,
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

  const fetchSubscription = initFetchObservable({
    responseBodyAction: (context) => (isNetworkError(context) ? ResponseBodyAction.COLLECT : ResponseBodyAction.IGNORE),
  }).subscribe((context) => {
    if (context.state === 'resolve') {
      handleResponse(RequestType.FETCH, context)
    }
  })

  function isNetworkError(request: XhrCompleteContext | FetchResolveContext) {
    return !isIntakeUrl(request.url) && (isRejected(request) || isServerError(request.status))
  }

  function handleResponse(type: RequestType, request: XhrCompleteContext | FetchResolveContext) {
    if (!isNetworkError(request)) {
      return
    }

    const stack =
      'error' in request && request.error
        ? toStackTraceString(computeStackTrace(request.error))
        : request.responseBody || 'Failed to load'

    const domainContext: LogsEventDomainContext<typeof ErrorSource.NETWORK> = {
      isAborted: request.isAborted,
      handlingStack: request.handlingStack,
    }

    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        message: `${format(type)} error ${request.method} ${request.url}`,
        date: request.startClocks.timeStamp,
        error: {
          stack: safeTruncate(stack, configuration.requestErrorResponseLengthLimit, '...'),
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

  return {
    stop: () => {
      xhrSubscription.unsubscribe()
      fetchSubscription.unsubscribe()
    },
  }
}

function isRejected(request: { status: number; responseType?: string }) {
  return request.status === 0 && request.responseType !== 'opaque'
}

function format(type: RequestType) {
  if (RequestType.XHR === type) {
    return 'XHR'
  }
  return 'Fetch'
}
