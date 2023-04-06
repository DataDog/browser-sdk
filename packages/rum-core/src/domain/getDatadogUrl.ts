import { INTAKE_SITE_STAGING, INTAKE_SITE_US1, INTAKE_SITE_EU1 } from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'

export type SessionReplayUrlQueryParams = { errorType?: string; seed?: string; from?: number }
export function getSessionReplayUrl(
  configuration: RumConfiguration,
  sessionId: string,
  { errorType, seed, from }: SessionReplayUrlQueryParams
): string {
  const parameters: string[] = []
  if (errorType !== undefined) {
    parameters.push(`error-type=${errorType}`)
  }
  if (seed !== undefined) {
    parameters.push(`seed=${seed}`)
  }
  if (from !== undefined) {
    parameters.push(`from=${from}`)
  }
  const origin = getDatadogSiteUrl(configuration)
  const path = `/rum/replay/sessions/${sessionId}`
  return `${origin}${path}?${parameters.join('&')}`
}

export function getDatadogSiteUrl(rumConfiguration: RumConfiguration) {
  const site = rumConfiguration.site
  const subdomain = rumConfiguration.subdomain || getSiteDefaultSubdomain(rumConfiguration)
  return `https://${subdomain ? `${subdomain}.` : ''}${site}`
}

function getSiteDefaultSubdomain(configuration: RumConfiguration): string | undefined {
  switch (configuration.site) {
    case INTAKE_SITE_US1:
    case INTAKE_SITE_EU1:
      return 'app'
    case INTAKE_SITE_STAGING:
      return 'dd'
    default:
      return undefined
  }
}
