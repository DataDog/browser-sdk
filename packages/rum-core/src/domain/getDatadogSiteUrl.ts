import { INTAKE_SITE_STAGING, INTAKE_SITE_US1, INTAKE_SITE_EU1 } from '@datadog/browser-core'
import type { RumConfiguration } from './configuration'

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
