export type Site =
  | 'datadoghq.com'
  | 'us3.datadoghq.com'
  | 'us5.datadoghq.com'
  | 'datadoghq.eu'
  | 'ddog-gov.com'
  | 'us2.ddog-gov.com'
  | 'ap1.datadoghq.com'
  | 'ap2.datadoghq.com'
  | (string & {})

export const INTAKE_SITE_STAGING: Site = 'datad0g.com'
export const INTAKE_SITE_US1: Site = 'datadoghq.com'
export const INTAKE_SITE_EU1: Site = 'datadoghq.eu'
export const INTAKE_SITE_US1_FED: Site = 'ddog-gov.com'
export const INTAKE_SITE_US2_FED: Site = 'us2.ddog-gov.com'

export const INTAKE_URL_PARAMETERS = ['ddsource', 'dd-api-key', 'dd-request-id']
