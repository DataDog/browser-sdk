import type { Pipeline, NetworkRequestResource } from '@datadog/core-next'
import { createIdentifier, makeTracingHeaders, findTracingOption, isSampled } from '@datadog/core-next'
import type { TracingOption, Identifier } from '@datadog/core-next'
import { isIntakeUrl } from '../browser'

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-auth-token',
  'x-api-key',
  'x-csrf-token',
  'proxy-authorization',
  'www-authenticate',
])

interface CollectorTracingConfig {
  tracingOptions: TracingOption[]
  traceSampleRate: number
  traceContextInjection: 'sampled' | 'all'
  sessionId: string
}

interface FetchCollectorConfig {
  tracingConfig?: CollectorTracingConfig
  allowedResponseHeaders?: string[]
}

function collectResponseHeaders(
  response: Response,
  allowlist: string[]
): Array<{ name: string; value: string }> | undefined {
  if (allowlist.length === 0) return undefined

  const normalizedAllowlist = allowlist.map((h) => h.toLowerCase())
  const headers: Array<{ name: string; value: string }> = []

  response.headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (SENSITIVE_HEADERS.has(lower)) return
    if (normalizedAllowlist.includes(lower)) {
      headers.push({ name, value })
    }
  })

  return headers.length > 0 ? headers : undefined
}

function startFetchCollection(
  pipeline: Pipeline<Record<string, unknown>>,
  tracingConfig?: CollectorTracingConfig,
  collectorConfig?: FetchCollectorConfig
): () => void {
  // Support both legacy signature (tracingConfig) and new config object
  const resolvedTracingConfig = collectorConfig?.tracingConfig ?? tracingConfig
  const allowedResponseHeaders = collectorConfig?.allowedResponseHeaders
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

    if (resolvedTracingConfig) {
      const option = findTracingOption(url, resolvedTracingConfig.tracingOptions)
      if (option) {
        const sampled = isSampled(resolvedTracingConfig.sessionId, resolvedTracingConfig.traceSampleRate)
        if (sampled || resolvedTracingConfig.traceContextInjection === 'all') {
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
        const responseHeaders =
          allowedResponseHeaders && allowedResponseHeaders.length > 0
            ? collectResponseHeaders(response, allowedResponseHeaders)
            : undefined

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
          ...(responseHeaders ? { responseHeaders } : {}),
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
export type { CollectorTracingConfig, FetchCollectorConfig }
