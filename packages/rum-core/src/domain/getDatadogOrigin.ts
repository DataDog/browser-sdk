import type { RumConfiguration } from './configuration'

export function getDatadogOrigin(rumConfiguration: RumConfiguration) {
  const site = rumConfiguration.site
  const subdomain = rumConfiguration.subdomain || getDefaultSubdomain(rumConfiguration)
  return `https://${subdomain ? `${subdomain}.` : ''}${site}`
}

function getDefaultSubdomain(configuration: RumConfiguration): string | undefined {
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
