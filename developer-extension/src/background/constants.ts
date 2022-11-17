export const DEV_LOGS_URL = 'http://localhost:8080/datadog-logs.js'
export const DEV_RUM_URL = 'http://localhost:8080/datadog-rum.js'
export const DEV_RUM_SLIM_URL = 'http://localhost:8080/datadog-rum-slim.js'

export const INTAKE_DOMAINS = [
  'browser-intake-datadoghq.com',
  'browser-intake-datadoghq.eu',
  'browser-intake-ddog-gov.com',
  'browser-intake-us3-datadoghq.com',
  'browser-intake-us5-datadoghq.com',
  ...['com', 'eu'].flatMap((tld) => [
    `public-trace-http-intake.logs.datadoghq.${tld}`,
    `rum-http-intake.logs.datadoghq.${tld}`,
    `browser-http-intake.logs.datadoghq.${tld}`,
  ]),
]
