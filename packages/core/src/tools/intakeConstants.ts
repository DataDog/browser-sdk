// Intake site constants used by telemetry
// These are defined here to avoid circular dependencies between telemetry and configuration modules

export type Site =
  | 'datadoghq.com'
  | 'us3.datadoghq.com'
  | 'us5.datadoghq.com'
  | 'datadoghq.eu'
  | 'ddog-gov.com'
  | 'ap1.datadoghq.com'

export const INTAKE_SITE_STAGING: Site = 'datad0g.com' as Site
export const INTAKE_SITE_US1_FED: Site = 'ddog-gov.com'
