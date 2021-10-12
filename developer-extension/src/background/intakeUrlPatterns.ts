export const intakeUrlPatterns = [
  // TODO: implement a configuration page to add more URLs in this list.
  'https://*.browser-intake-datadoghq.com/*',
  'https://*.browser-intake-datadoghq.eu/*',
  'https://*.browser-intake-ddog-gov.com/*',
  'https://*.browser-intake-us3-datadoghq.com/*',
  'https://*.browser-intake-us5-datadoghq.com/*',
  ...classicIntakesUrlsForSite('datadoghq.com'),
  ...classicIntakesUrlsForSite('datadoghq.eu'),
]

function classicIntakesUrlsForSite(site: string) {
  return [
    `https://public-trace-http-intake.logs.${site}/*`,
    `https://rum-http-intake.logs.${site}/*`,
    `https://browser-http-intake.logs.${site}/*`,
  ]
}
