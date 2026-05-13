import { fetch, setTimeout, clearTimeout, buildEndpointHost } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'

// Exact reason strings returned by the backend quota admission API.
export type BackendQuotaReason =
  | 'quota_ok'
  | 'quota_exceeded'
  | 'org_disabled'
  | 'backend_unavailable'
  | 'backend_client_not_initialized'
  | 'undefined'

// SDK-only reasons used when the backend is not reachable.
export type FrontendQuotaReason = 'timeout' | 'api-error'

export type QuotaReason = BackendQuotaReason | FrontendQuotaReason

export interface QuotaResult {
  decision: 'quota_ok' | 'quota_ko'
  reason: QuotaReason
}

function parseQuotaResult(body: unknown, httpStatusFallback: QuotaResult): QuotaResult {
  const attrs = (body as any)?.data?.attributes
  if (!attrs || typeof attrs.admitted !== 'boolean' || typeof attrs.reason !== 'string') {
    return httpStatusFallback
  }
  return {
    decision: attrs.admitted ? 'quota_ok' : 'quota_ko',
    reason: attrs.reason as BackendQuotaReason,
  }
}

export function checkProfilingQuota(
  configuration: RumConfiguration,
  sessionId: string,
  timeoutMs = 5000
): Promise<QuotaResult> {
  const host = `quota.${buildEndpointHost({ site: configuration.site, clientToken: configuration.clientToken })}`
  const url = `https://${host}/api/v2/profiling/quota?session_id=${sessionId}`
  const controller = new AbortController()

  let timeoutId: ReturnType<typeof setTimeout>

  const fetchPromise = fetch(url, {
    credentials: 'omit',
    signal: controller.signal,
    headers: new Headers({
      'DD-CLIENT-TOKEN': configuration.clientToken,
    }),
  })
    .then((response) => {
      const statusFallback: QuotaResult =
        response.status === 429
          ? { decision: 'quota_ko', reason: 'quota_exceeded' }
          : { decision: 'quota_ok', reason: 'api-error' }
      return response.json().then(
        (body): QuotaResult => {
          clearTimeout(timeoutId)
          return parseQuotaResult(body, statusFallback)
        },
        (): QuotaResult => {
          // Body unparseable — fall back to HTTP status
          clearTimeout(timeoutId)
          return statusFallback
        }
      )
    })
    .catch((): QuotaResult => {
      clearTimeout(timeoutId)
      return { decision: 'quota_ok', reason: 'api-error' }
    })

  const timeoutPromise = new Promise<QuotaResult>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve({ decision: 'quota_ok', reason: 'timeout' })
    }, timeoutMs)
  })

  return Promise.race([fetchPromise, timeoutPromise])
}
