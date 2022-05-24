import type { BuildEnvWindow } from '../../../test/specHelper'
import { computeTransportConfiguration } from './transportConfiguration'

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'

  beforeEach(() => {
    ;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'some_version'
  })

  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.rumEndpointBuilder.build()).toContain('datadoghq.com')
      expect(configuration.site).toBe('datadoghq.com')
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'foo.com' })
      expect(configuration.rumEndpointBuilder.build()).toContain('foo.com')
      expect(configuration.site).toBe('foo.com')
    })
  })

  describe('query parameters', () => {
    it('should add intake query parameters', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.rumEndpointBuilder.build()).toMatch(
        `&dd-api-key=${clientToken}&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)`
      )
    })

    it('should add batch_time for rum endpoint', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.rumEndpointBuilder.build()).toContain('&batch_time=')
    })

    it('should not add batch_time for logs and replay endpoints', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.logsEndpointBuilder.build()).not.toContain('&batch_time=')
      expect(configuration.sessionReplayEndpointBuilder.build()).not.toContain('&batch_time=')
    })
  })

  describe('proxyUrl', () => {
    it('should replace the full intake endpoint by the proxyUrl and set it in the attribute ddforward', () => {
      const configuration = computeTransportConfiguration({ clientToken, proxyUrl: 'https://proxy.io/path' })
      expect(configuration.rumEndpointBuilder.build()).toMatch(
        `https://proxy.io/path\\?ddforward=${encodeURIComponent(
          `https://rum.browser-intake-datadoghq.com/api/v2/rum?ddsource=(.*)&ddtags=(.*)&dd-api-key=${clientToken}` +
            '&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)&batch_time=(.*)'
        )}`
      )
    })
  })

  describe('sdk_version, env, version and service', () => {
    it('should not modify the logs and rum endpoints tags when not defined', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).toContain('&ddtags=sdk_version:some_version')

      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).not.toContain(',env:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).not.toContain(',service:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).not.toContain(',version:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).not.toContain(',datacenter:')

      expect(decodeURIComponent(configuration.logsEndpointBuilder.build())).not.toContain(',env:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build())).not.toContain(',service:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build())).not.toContain(',version:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build())).not.toContain(',datacenter:')
    })

    it('should be set as tags in the logs and rum endpoints', () => {
      const configuration = computeTransportConfiguration({ clientToken, env: 'foo', service: 'bar', version: 'baz' })
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).toContain(
        '&ddtags=sdk_version:some_version,env:foo,service:bar,version:baz'
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build())).toContain(
        '&ddtags=sdk_version:some_version,env:foo,service:bar,version:baz'
      )
    })
  })

  describe('tags', () => {
    it('should be encoded', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        service: 'bar:foo',
        datacenter: 'us1.prod.dog',
      })
      expect(configuration.rumEndpointBuilder.build()).toContain(
        'ddtags=sdk_version%3Asome_version%2Cservice%3Abar%3Afoo%2Cdatacenter%3Aus1.prod.dog'
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
        })

        expect(configuration.isIntakeUrl(`https://rum.${intakeDomain}/api/v2/rum?xxx`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://logs.${intakeDomain}/api/v2/logs?xxx`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://session-replay.${intakeDomain}/api/v2/replay?xxx`)).toBe(true)

        expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.com/api/v2/rum?xxx')).toBe(true)
        expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.com/api/v2/logs?xxx')).toBe(true)
        expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.com/api/v2/replay?xxx')).toBe(
          false
        )
      })
    })
  })
})
