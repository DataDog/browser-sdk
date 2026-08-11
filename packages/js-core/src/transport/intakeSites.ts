/** A Datadog intake site hostname. Extensible with custom string values for internal use. */
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

/** Datadog staging environment (internal use). */
export const INTAKE_SITE_STAGING: Site = 'datad0g.com'
/** Datadog US1 site (default). */
export const INTAKE_SITE_US1: Site = 'datadoghq.com'
/** Datadog EU1 site. */
export const INTAKE_SITE_EU1: Site = 'datadoghq.eu'
/** Datadog US1 FedRAMP site. */
export const INTAKE_SITE_US1_FED: Site = 'ddog-gov.com'
/** Datadog US2 FedRAMP site. */
export const INTAKE_SITE_US2_FED: Site = 'us2.ddog-gov.com'

/** URL query parameters that identify a Datadog intake request. */
export const INTAKE_URL_PARAMETERS = ['ddsource', 'dd-api-key', 'dd-request-id']

/** Returns true if the URL targets a Datadog intake endpoint. */
export function isIntakeUrl(url: string): boolean {
  // check if tags is present in the query string
  return INTAKE_URL_PARAMETERS.every((param) => url.includes(param))
}
