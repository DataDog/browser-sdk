import { fetch, setTimeout, clearTimeout, buildEndpointHost } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'

export function checkProfilingQuota(
  configuration: RumConfiguration,
  sessionId: string,
  timeoutMs = 5000
): Promise<'quota-ok' | 'quota-exceeded'> {
  // Follow the same browser-intake-* host derivation used by all other SDK endpoints,
  // but bypass the fed-staging and internalAnalyticsSubdomain special cases which don't
  // apply to the quota endpoint.
  const host = `quota.${buildEndpointHost('profile', { site: configuration.site })}`
  const url = `https://${host}?session_id=${sessionId}`
  const controller = new AbortController()

  let timeoutId: ReturnType<typeof setTimeout>

  const fetchPromise = fetch(url, {
    credentials: 'omit',
    signal: controller.signal,
    headers: new Headers({
      'DD-CLIENT-TOKEN': configuration.clientToken,
    }),
  })
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
