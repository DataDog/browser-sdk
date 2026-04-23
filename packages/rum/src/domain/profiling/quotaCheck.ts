import { fetch, setTimeout, clearTimeout } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'

const getQuotaBaseURL = (site: string) => {
  switch (site) {
    case 'datad0g.com':
      return `https://dd.${site}`
    default:
      return `https://app.${site}`
  }
}

export function checkProfilingQuota(
  configuration: RumConfiguration,
  sessionId: string,
  timeoutMs = 5000
): Promise<'quota-ok' | 'quota-exceeded'> {
  const url = `${getQuotaBaseURL(configuration.site)}/api/unstable/profiling/admission?session_id=${sessionId}`
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
