const SITE_TO_CDN_PREFIX: Record<string, string> = {
  'datadoghq.com': 'us1',
  'us3.datadoghq.com': 'us3',
  'us5.datadoghq.com': 'us5',
  'datadoghq.eu': 'eu1',
  'ap1.datadoghq.com': 'ap1',
  'ddog-gov.com': '',
}

export function buildCdnUrl(site: string, version: string = 'v6'): string {
  const prefix = SITE_TO_CDN_PREFIX[site] || 'us1'

  if (site === 'ddog-gov.com') {
    // US1-FED uses different pattern
    return `https://www.datadoghq-browser-agent.com/datadog-rum-${version}.js`
  }

  return `https://www.datadoghq-browser-agent.com/${prefix}/${version}/datadog-rum.js`
}
