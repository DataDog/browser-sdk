import type { Pipeline, NetworkRequestResource } from '@datadog/core-next'
import { createIdentifier, makeTracingHeaders, findTracingOption, isSampled } from '@datadog/core-next'
import type { TracingOption, Identifier } from '@datadog/core-next'
import { isIntakeUrl } from '../browser'

interface CollectorTracingConfig {
  tracingOptions: TracingOption[]
  traceSampleRate: number
  traceContextInjection: 'sampled' | 'all'
  sessionId: string
}

function startFetchCollection(
  pipeline: Pipeline<Record<string, unknown>>,
  tracingConfig?: CollectorTracingConfig
): () => void {
  const originalFetch = window.fetch

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const startTime = performance.now()
    const startDate = Date.now()

    if (isIntakeUrl(url)) {
      return originalFetch.call(this, input, init)
    }

    pipeline.publish('signal:network_request_start', { url, method })

    let traceId: Identifier | undefined
    let spanId: Identifier | undefined

    if (tracingConfig) {
      const option = findTracingOption(url, tracingConfig.tracingOptions)
      if (option) {
        const sampled = isSampled(tracingConfig.sessionId, tracingConfig.traceSampleRate)
        if (sampled || tracingConfig.traceContextInjection === 'all') {
          traceId = createIdentifier(64)
          spanId = createIdentifier(63)
          const headers = makeTracingHeaders(traceId, spanId, sampled, option.propagatorTypes)

          const existingHeaders = new Headers(init?.headers)
          for (const [name, value] of Object.entries(headers)) {
            existingHeaders.set(name, value)
          }
          init = { ...init, headers: existingHeaders }
        }
      }
    }

    return originalFetch.call(this, input, init).then(
      (response: Response) => {
        const resource: NetworkRequestResource = {
          method,
          url,
          status: response.status,
          isAborted: false,
          startTime,
          startDate,
          duration: performance.now() - startTime,
          traceId,
          spanId,
        }
        pipeline.publish('resource:network_request', resource)
        return response
      },
      (error: unknown) => {
        const resource: NetworkRequestResource = {
          method,
          url,
          status: 0,
          isAborted: error instanceof DOMException && error.name === 'AbortError',
          startTime,
          startDate,
          duration: performance.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
          traceId,
          spanId,
        }
        pipeline.publish('resource:network_request', resource)
        throw error
      }
    )
  }

  return () => {
    window.fetch = originalFetch
  }
}

export { startFetchCollection }
export type { CollectorTracingConfig }
