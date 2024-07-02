export const INTAKE_DOMAINS = [
  'iam-rum-intake.datadoghq.com',
  'browser-intake-datad0g.com',
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
