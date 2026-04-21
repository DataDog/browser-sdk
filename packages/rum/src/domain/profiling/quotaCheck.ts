import { fetch, setTimeout, clearTimeout } from '@datadog/browser-core'
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
      return response.status === 429 ? 'quota-exceeded' : 'quota-ok'
    })
    .catch((): 'quota-ok' => {
      clearTimeout(timeoutId)
      return 'quota-ok'
    })

  const timeoutPromise = new Promise<'quota-ok'>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      resolve('quota-ok')
    }, timeoutMs)
  })

  return Promise.race([fetchPromise, timeoutPromise])
}
