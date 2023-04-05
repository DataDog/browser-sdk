import type { RumConfiguration } from '@datadog/browser-rum-core'
import { getDatadogSiteUrl } from './getDatadogSiteUrl'

describe('getDatadogSiteUrl', () => {
  const parameters: Array<[string, string | undefined, string]> = [
    ['datadoghq.com', undefined, 'app.datadoghq.com'],
    ['datadoghq.com', 'toto', 'toto.datadoghq.com'],
    ['datad0g.com', undefined, 'dd.datad0g.com'],
    ['datad0g.com', 'toto', 'toto.datad0g.com'],
    ['us3.datadoghq.com', undefined, 'us3.datadoghq.com'],
    ['us3.datadoghq.com', 'toto', 'toto.us3.datadoghq.com'],
    ['us5.datadoghq.com', undefined, 'us5.datadoghq.com'],
    ['us5.datadoghq.com', 'toto', 'toto.us5.datadoghq.com'],
  ]

  parameters.forEach(([site, subdomain, host]) => {
    it(`should return ${host} for subdomain "${
      subdomain ?? 'undefined'
    }" on "${site}" with query params if view is found`, () => {
      const link = getDatadogSiteUrl({ site, subdomain } as RumConfiguration)

      expect(link).toBe(`https://${host}`)
    })
  })
})
