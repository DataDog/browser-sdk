import { FetchCompleteContext, resetFetchProxy, startFetchProxy } from '../../browser/fetchProxy'
import { resetXhrProxy, startXhrProxy, XhrCompleteContext } from '../../browser/xhrProxy'
import { ErrorSource } from '../../tools/error'
import { ErrorObservable } from '../../tools/observable'
import { RequestType } from '../../tools/utils'
import { Configuration } from '../configuration'

export function trackNetworkError(configuration: Configuration, errorObservable: ErrorObservable) {
  startXhrProxy().onRequestComplete((context) => handleCompleteRequest(RequestType.XHR, context))
  startFetchProxy().onRequestComplete((context) => handleCompleteRequest(RequestType.FETCH, context))

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
        stack: truncateResponseText(request.responseText, configuration) || 'Failed to load',
        startClocks: request.startClocks,
      })
    }
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

function truncateResponseText(responseText: string | undefined, configuration: Configuration) {
  if (responseText && responseText.length > configuration.requestErrorResponseLengthLimit) {
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
