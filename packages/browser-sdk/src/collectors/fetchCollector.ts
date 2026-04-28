import type { Pipeline, NetworkRequestResource } from '@datadog/core-next'
import { isIntakeUrl } from '../browser'

function startFetchCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const originalFetch = window.fetch

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const startTime = performance.now()
    const startDate = Date.now()

    if (!isIntakeUrl(url)) {
      pipeline.publish('signal:network_request_start', { url, method })
    }

    return originalFetch.apply(this, arguments as any).then(
      (response: Response) => {
        if (isIntakeUrl(url)) return response
        const resource: NetworkRequestResource = {
          method,
          url,
          status: response.status,
          isAborted: false,
          startTime,
          startDate,
          duration: performance.now() - startTime,
        }
        pipeline.publish('resource:network_request', resource)
        return response
      },
      (error: unknown) => {
        if (!isIntakeUrl(url)) {
          const resource: NetworkRequestResource = {
            method,
            url,
            status: 0,
            isAborted: error instanceof DOMException && error.name === 'AbortError',
            startTime,
            startDate,
            duration: performance.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
          }
          pipeline.publish('resource:network_request', resource)
        }
        throw error
      }
    )
  }

  return () => {
    window.fetch = originalFetch
  }
}

export { startFetchCollection }
