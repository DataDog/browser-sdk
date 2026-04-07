import type { ProxyFn } from '@datadog/core-next'

type TrackType = 'logs' | 'rum' | 'replay' | 'profile' | 'exposures' | 'flagevaluation'

const INTAKE_SITE_US1 = 'datadoghq.com'
const INTAKE_SITE_FED_STAGING = 'dd0g-gov.com'
const PCI_INTAKE_HOST_US1 = 'pci.browser-intake-datadoghq.com'
const INTAKE_URL_PARAMETERS = ['ddsource', 'dd-api-key', 'dd-request-id']

interface EndpointBuilderOptions {
  clientToken: string
  site: string
  trackType: TrackType
  sdkVersion?: string
  source?: string
  proxy?: string | ProxyFn
  usePciIntake?: boolean
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
 * Build the intake host from the site and track type.
 *
 * `datadoghq.com`       → `browser-intake-datadoghq.com`
 * `us3.datadoghq.com`   → `browser-intake-us3-datadoghq.com`
 * `datadoghq.eu`        → `browser-intake-datadoghq.eu`
 * `ddog-gov.com`        → `browser-intake-ddog-gov.com`
 *
 * Special cases:
 * - PCI intake for logs on US1: `pci.browser-intake-datadoghq.com`
 * - Fed staging: `http-intake.logs.{site}`
 */
function buildIntakeHost(site: string, trackType: TrackType, usePciIntake?: boolean): string {
  if (trackType === 'logs' && usePciIntake && site === INTAKE_SITE_US1) {
    return PCI_INTAKE_HOST_US1
  }

  if (site === INTAKE_SITE_FED_STAGING) {
    return `http-intake.logs.${site}`
  }

  const parts = site.split('.')
  const extension = parts.pop()!
  return `browser-intake-${parts.join('-')}.${extension}`
}

function buildQueryParameters(clientToken: string, sdkVersion: string, source: string): string {
  const params = [
    `ddsource=${source}`,
    `dd-api-key=${clientToken}`,
    `dd-evp-origin-version=${encodeURIComponent(sdkVersion)}`,
    'dd-evp-origin=browser',
    `dd-request-id=${crypto.randomUUID()}`,
    `batch_time=${Date.now()}`,
  ]
  return params.join('&')
}

function createEndpointBuilder(options: EndpointBuilderOptions): EndpointBuilder {
  const { clientToken, site, trackType, usePciIntake, proxy } = options
  const sdkVersion = options.sdkVersion ?? '0.0.0'
  const source = options.source ?? 'browser'
  const path = `/api/v2/${trackType}`

  return {
    trackType,

    build() {
      const parameters = buildQueryParameters(clientToken, sdkVersion, source)

      if (typeof proxy === 'function') {
        return proxy({ path, parameters })
      }

      if (typeof proxy === 'string') {
        return `${proxy}?ddforward=${encodeURIComponent(`${path}?${parameters}`)}`
      }

      const host = buildIntakeHost(site, trackType, usePciIntake)
      return `https://${host}${path}?${parameters}`
    },
  }
}

/**
 * Check if a URL is a Datadog intake URL (contains ddsource, dd-api-key, dd-request-id).
 * Used by network collectors to filter out the SDK's own requests.
 */
function isIntakeUrl(url: string): boolean {
  return INTAKE_URL_PARAMETERS.every((param) => url.includes(param))
}

export { createEndpointBuilder, buildIntakeHost, isIntakeUrl, INTAKE_SITE_US1, PCI_INTAKE_HOST_US1 }
export type { EndpointBuilder, EndpointBuilderOptions, TrackType }
