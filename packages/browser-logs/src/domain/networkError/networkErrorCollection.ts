import type { FetchResolveContext, XhrCompleteContext, Observable, BufferedData } from '@datadog/browser-core'
import {
  BufferedDataType,
  ErrorSource,
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

export function startNetworkErrorCollection(
  configuration: LogsConfiguration,
  lifeCycle: LifeCycle,
  bufferedDataObservable: Observable<BufferedData>
) {
  if (!configuration.forwardErrorsToLogs) {
    return { stop: noop }
  }

  // Register responseBodyAction getter (no subscription needed)
  initFetchObservable({
    responseBodyAction: (context) => (isNetworkError(context) ? ResponseBodyAction.COLLECT : ResponseBodyAction.IGNORE),
  })

  const subscription = bufferedDataObservable.subscribe(({ data, type }) => {
    if (type === BufferedDataType.FETCH && data.state === 'resolve') {
      handleResponse(RequestType.FETCH, data)
    } else if (type === BufferedDataType.XHR && data.state === 'complete') {
      handleResponse(RequestType.XHR, data)
    }
  })

  function isNetworkError(request: XhrCompleteContext | FetchResolveContext) {
    return !isIntakeUrl(request.url) && !request.isAborted && (isRejected(request) || isServerError(request.status))
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

  return { stop: () => subscription.unsubscribe() }
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
