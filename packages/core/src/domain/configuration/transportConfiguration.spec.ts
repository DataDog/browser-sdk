import { computeTransportConfiguration } from './transportConfiguration'

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'
  const internalAnalyticsSubdomain = 'ia-rum-intake'
  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.rumEndpointBuilder.build('xhr')).toContain('datadoghq.com')
      expect(configuration.site).toBe('datadoghq.com')
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'foo.com' })
      expect(configuration.rumEndpointBuilder.build('xhr')).toContain('foo.com')
      expect(configuration.site).toBe('foo.com')
    })
  })

  describe('internalAnalyticsSubdomain', () => {
    it('should use internal analytics subdomain value when set for datadoghq.com site', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('xhr')).toContain(internalAnalyticsSubdomain)
    })

    it('should not use internal analytics subdomain value when set for other sites', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        site: 'foo.bar',
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('xhr')).not.toContain(internalAnalyticsSubdomain)
    })
  })

  describe('sdk_version, env, version and service', () => {
    it('should not modify the logs and rum endpoints tags when not defined', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr'))).not.toContain(',env:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr'))).not.toContain(',service:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr'))).not.toContain(',version:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr'))).not.toContain(',datacenter:')

      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr'))).not.toContain(',env:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr'))).not.toContain(',service:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr'))).not.toContain(',version:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr'))).not.toContain(',datacenter:')
    })

    it('should be set as tags in the logs and rum endpoints', () => {
      const configuration = computeTransportConfiguration({ clientToken, env: 'foo', service: 'bar', version: 'baz' })
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr'))).toContain(
        'env:foo,service:bar,version:baz'
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr'))).toContain(
        'env:foo,service:bar,version:baz'
      )
    })
  })

  describe('isIntakeUrl', () => {
    ;[
      { site: 'datadoghq.eu', intakeDomain: 'browser-intake-datadoghq.eu' },
      { site: 'datadoghq.com', intakeDomain: 'browser-intake-datadoghq.com' },
      { site: 'us3.datadoghq.com', intakeDomain: 'browser-intake-us3-datadoghq.com' },
      { site: 'us5.datadoghq.com', intakeDomain: 'browser-intake-us5-datadoghq.com' },
      { site: 'ddog-gov.com', intakeDomain: 'browser-intake-ddog-gov.com' },
    ].forEach(({ site, intakeDomain }) => {
      it(`should detect intake request for ${site} site`, () => {
        const configuration = computeTransportConfiguration({ clientToken, site })
        expect(configuration.isIntakeUrl(`https://rum.${intakeDomain}/api/v2/rum?xxx`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://logs.${intakeDomain}/api/v2/logs?xxx`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://session-replay.${intakeDomain}/api/v2/replay?xxx`)).toBe(true)
      })
    })

    it('should detect internal analytics intake request for datadoghq.com site', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        internalAnalyticsSubdomain,
      })
      expect(configuration.isIntakeUrl(`https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/rum?xxx`)).toBe(true)
    })

    it('should not detect non intake request', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.isIntakeUrl('https://www.foo.com')).toBe(false)
    })

    it('should handle sites with subdomains', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'foo.datadoghq.com' })
      expect(configuration.isIntakeUrl('https://rum.browser-intake-foo-datadoghq.com/api/v2/rum?xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-foo-datadoghq.com/api/v2/logs?xxx')).toBe(true)
      expect(
        configuration.isIntakeUrl('https://session-replay.browser-intake-foo-datadoghq.com/api/v2/replay?xxx')
      ).toBe(true)
    })

    it('should detect proxy intake request', () => {
      let configuration = computeTransportConfiguration({ clientToken, proxyUrl: 'https://www.proxy.com' })
      expect(configuration.isIntakeUrl('https://www.proxy.com/?ddforward=xxx')).toBe(true)

      configuration = computeTransportConfiguration({ clientToken, proxyUrl: 'https://www.proxy.com/custom/path' })
      expect(configuration.isIntakeUrl('https://www.proxy.com/custom/path?ddforward=xxx')).toBe(true)
    })

    it('should not detect request done on the same host as the proxy', () => {
      const configuration = computeTransportConfiguration({ clientToken, proxyUrl: 'https://www.proxy.com' })
      expect(configuration.isIntakeUrl('https://www.proxy.com/foo')).toBe(false)
    })
    ;[
      { site: 'datadoghq.eu', intakeDomain: 'browser-intake-datadoghq.eu' },
      { site: 'us3.datadoghq.com', intakeDomain: 'browser-intake-us3-datadoghq.com' },
      { site: 'us5.datadoghq.com', intakeDomain: 'browser-intake-us5-datadoghq.com' },
    ].forEach(({ site, intakeDomain }) => {
      it(`should detect replica intake request for site ${site}`, () => {
        const configuration = computeTransportConfiguration({
          clientToken,
          site,
          replica: { clientToken },
          internalAnalyticsSubdomain,
        })

        expect(configuration.isIntakeUrl(`https://rum.${intakeDomain}/api/v2/rum?xxx`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://logs.${intakeDomain}/api/v2/logs?xxx`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://session-replay.${intakeDomain}/api/v2/replay?xxx`)).toBe(true)

        expect(configuration.isIntakeUrl(`https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/rum?xxx`)).toBe(
          true
        )
        expect(configuration.isIntakeUrl(`https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/logs?xxx`)).toBe(
          true
        )
        expect(configuration.isIntakeUrl(`https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/replay?xxx`)).toBe(
          false
        )
      })
    })
  })
})
