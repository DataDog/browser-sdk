export type Site =
  | 'datadoghq.com'
  | 'us3.datadoghq.com'
  | 'us5.datadoghq.com'
  | 'datadoghq.eu'
  | 'ddog-gov.com'
  | 'ap1.datadoghq.com'

export type SiteWithStaging = Site | 'dd0g-gov.com' | 'datad0g.com'

export const INTAKE_SITE_STAGING: SiteWithStaging = 'datad0g.com'
export const INTAKE_SITE_FED_STAGING: SiteWithStaging = 'dd0g-gov.com'
export const INTAKE_SITE_US1: Site = 'datadoghq.com'
export const INTAKE_SITE_EU1: Site = 'datadoghq.eu'
export const INTAKE_SITE_US1_FED: Site = 'ddog-gov.com'

export const PCI_INTAKE_HOST_US1 = 'pci.browser-intake-datadoghq.com'
export const INTAKE_URL_PARAMETERS = ['ddsource', 'ddtags']
