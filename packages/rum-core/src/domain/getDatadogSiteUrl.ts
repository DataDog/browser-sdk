import type { RumConfiguration } from './configuration'

export function getDatadogSiteUrl(rumConfiguration: RumConfiguration) {
  const site = rumConfiguration.site
  const subdomain = rumConfiguration.subdomain || getSiteDefaultSubdomain(rumConfiguration)
  return `https://${subdomain ? `${subdomain}.` : ''}${site}`
}

function getSiteDefaultSubdomain(configuration: RumConfiguration): string | undefined {
  switch (configuration.site) {
    case 'datadoghq.com':
      return 'app'
    case 'datadoghq.eu':
      return 'app'
    case 'datad0g.com':
      return 'dd'
    default:
      return undefined
  }
}
