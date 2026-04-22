import { fetch, setTimeout, clearTimeout, addTelemetryDebug } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'

export function checkProfilingQuota(
  configuration: RumConfiguration,
  sessionId: string,
  timeoutMs = 5000
): Promise<'quota-ok' | 'quota-exceeded'> {
  const url = `https://api.${configuration.site}/api/unstable/profiling/admission?session_id=${sessionId}&dd-api-key=${configuration.clientToken}`
  const controller = new AbortController()

  let timeoutId: ReturnType<typeof setTimeout>

  const fetchPromise = fetch(url, { signal: controller.signal })
    .then((response): 'quota-ok' | 'quota-exceeded' => {
      clearTimeout(timeoutId)
      const result = response.status === 429 ? 'quota-exceeded' : 'quota-ok'
      addTelemetryDebug('Profiling quota check result', { result, status: response.status })
      return result
    })
    .catch((error): 'quota-ok' => {
      clearTimeout(timeoutId)
      // AbortErrors come from our own timeout and are logged there; only log genuine network errors
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        addTelemetryDebug('Profiling quota check network error', { result: 'quota-ok' })
      }
      return 'quota-ok'
    })

  const timeoutPromise = new Promise<'quota-ok'>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      addTelemetryDebug('Profiling quota check timed out', { result: 'quota-ok' })
      resolve('quota-ok')
    }, timeoutMs)
  })

  return Promise.race([fetchPromise, timeoutPromise])
}
