import type { Pipeline, NetworkRequestResource } from '@datadog/core-next'
import { isIntakeUrl } from '@datadog/browser-core-next'

function startFetchCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const originalFetch = window.fetch

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const startTime = Date.now()

    return originalFetch.apply(this, arguments as any).then(
      (response: Response) => {
        if (isIntakeUrl(url)) return response
        const resource: NetworkRequestResource = {
          method,
          url,
          status: response.status,
          isAborted: false,
          duration: Date.now() - startTime,
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
            duration: Date.now() - startTime,
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
