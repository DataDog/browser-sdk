import type { ProxyFn } from '@datadog/core-next'

type TrackType = 'logs' | 'rum' | 'replay'

interface EndpointBuilderOptions {
  clientToken: string
  site: string
  trackType: TrackType
  sdkVersion?: string
  proxy?: string | ProxyFn
}

interface EndpointBuilder {
  /**
   * Build the full endpoint URL for a request.
   * Query parameters change per request (request ID, batch time).
   */
  build(): string

  /** The track type this builder targets. */
  trackType: TrackType
}

/**
 * Build the intake host from the site.
 *
 * `datadoghq.com`       → `browser-intake-datadoghq.com`
 * `us3.datadoghq.com`   → `browser-intake-us3-datadoghq.com`
 * `datadoghq.eu`        → `browser-intake-datadoghq.eu`
 * `ddog-gov.com`        → `browser-intake-ddog-gov.com`
 */
function buildIntakeHost(site: string): string {
  const parts = site.split('.')
  const extension = parts.pop()!
  return `browser-intake-${parts.join('-')}.${extension}`
}

function buildQueryParameters(clientToken: string, sdkVersion: string): string {
  const params = [
    'ddsource=browser',
    `dd-api-key=${clientToken}`,
    `dd-evp-origin-version=${encodeURIComponent(sdkVersion)}`,
    'dd-evp-origin=browser',
    `dd-request-id=${crypto.randomUUID()}`,
    `batch_time=${Date.now()}`,
  ]
  return params.join('&')
}

function createEndpointBuilder(options: EndpointBuilderOptions): EndpointBuilder {
  const { clientToken, site, trackType, proxy } = options
  const sdkVersion = options.sdkVersion ?? '0.0.0'
  const path = `/api/v2/${trackType}`

  return {
    trackType,

    build() {
      const parameters = buildQueryParameters(clientToken, sdkVersion)

      if (typeof proxy === 'function') {
        return proxy({ path, parameters })
      }

      if (typeof proxy === 'string') {
        return `${proxy}?ddforward=${encodeURIComponent(`${path}?${parameters}`)}`
      }

      const host = buildIntakeHost(site)
      return `https://${host}${path}?${parameters}`
    },
  }
}

export { createEndpointBuilder, buildIntakeHost }
export type { EndpointBuilder, EndpointBuilderOptions, TrackType }
