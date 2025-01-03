export const INTAKE_SITE_STAGING = 'datad0g.com'
export const INTAKE_SITE_FED_STAGING = 'dd0g-gov.com'
export const INTAKE_SITE_US1 = 'datadoghq.com'
export const INTAKE_SITE_EU1 = 'datadoghq.eu'
export const INTAKE_SITE_US1_FED = 'ddog-gov.com'

export const PCI_INTAKE_HOST_US1 = 'pci.browser-intake-datadoghq.com'
export const INTAKE_URL_PARAMETERS = ['ddsource', 'ddtags']

const predefinedSites: Record<string, string> = {
  [INTAKE_SITE_STAGING]: 'staging',
  [INTAKE_SITE_FED_STAGING]: 'fed-staging',
  [INTAKE_SITE_US1]: 'us1',
  [INTAKE_SITE_EU1]: 'eu1',
  [INTAKE_SITE_US1_FED]: 'us1-fed',
}

export function getSiteShortName(site: string | undefined) {
  if (!site) {
    return 'us1'
  }

  if (predefinedSites[site]) {
    return predefinedSites[site]
  }

  // Infer short names for subdomain-based datacenters to support for new DCs without code changes.
  const match = site.match(/^([a-z0-9]+)\.datadoghq\.com$/)
  if (match) {
    return match[1]
  }
}
