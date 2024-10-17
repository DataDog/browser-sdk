import type { Payload } from '../../transport'
import { computeTransportConfiguration } from './transportConfiguration'
import { INTAKE_SITE_FED_STAGING } from './intakeSites'

const DEFAULT_PAYLOAD = {} as Payload

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'
  const internalAnalyticsSubdomain = 'ia-rum-intake'
  const intakeParameters = 'ddsource=browser&ddtags=sdk_version'

  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).toContain('datadoghq.com')
      expect(configuration.site).toBe('datadoghq.com')
    })

    it('should use logs intake domain for fed staging', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: INTAKE_SITE_FED_STAGING })
      expect(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).toContain('http-intake.logs.dd0g-gov.com')
      expect(configuration.site).toBe(INTAKE_SITE_FED_STAGING)
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'foo.com' })
      expect(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).toContain('foo.com')
      expect(configuration.site).toBe('foo.com')
    })
  })

  describe('internalAnalyticsSubdomain', () => {
    it('should use internal analytics subdomain value when set for datadoghq.com site', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).toContain(internalAnalyticsSubdomain)
    })

    it('should not use internal analytics subdomain value when set for other sites', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        site: 'foo.bar',
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD)).not.toContain(internalAnalyticsSubdomain)
    })
  })

  describe('sdk_version, env, version and service', () => {
    it('should not modify the logs and rum endpoints tags when not defined', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(',env:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',service:'
      )
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',version:'
      )
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',datacenter:'
      )

      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(',env:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',service:'
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',version:'
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).not.toContain(
        ',datacenter:'
      )
    })

    it('should be set as tags in the logs and rum endpoints', () => {
      const configuration = computeTransportConfiguration({ clientToken, env: 'foo', service: 'bar', version: 'baz' })
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).toContain(
        'env:foo,service:bar,version:baz'
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))).toContain(
        'env:foo,service:bar,version:baz'
      )
    })
  })

  describe('isIntakeUrl', () => {
    const v1IntakePath = `/v1/input/${clientToken}`
    ;[
      { site: 'datadoghq.eu', intakeDomain: 'browser-intake-datadoghq.eu' },
      { site: 'datadoghq.com', intakeDomain: 'browser-intake-datadoghq.com' },
      { site: 'datadoghq.com', intakeDomain: 'pci.browser-intake-datadoghq.com' },
      { site: 'us3.datadoghq.com', intakeDomain: 'browser-intake-us3-datadoghq.com' },
      { site: 'us5.datadoghq.com', intakeDomain: 'browser-intake-us5-datadoghq.com' },
      { site: 'ap1.datadoghq.com', intakeDomain: 'browser-intake-ap1-datadoghq.com' },
      { site: 'ddog-gov.com', intakeDomain: 'browser-intake-ddog-gov.com' },
      { site: 'datad0g.com', intakeDomain: 'browser-intake-datad0g.com' },
      { site: 'dd0g-gov.com', intakeDomain: 'http-intake.logs.dd0g-gov.com' },
    ].forEach(({ site, intakeDomain }) => {
      it(`should detect intake request for ${site} site`, () => {
        const configuration = computeTransportConfiguration({ clientToken, site })

        expect(configuration.isIntakeUrl(`https://${intakeDomain}/api/v2/rum?${intakeParameters}`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://${intakeDomain}/api/v2/logs?${intakeParameters}`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://${intakeDomain}/api/v2/replay?${intakeParameters}`)).toBe(true)
      })

      it(`should detect older versions of the ${site} site`, () => {
        const configuration = computeTransportConfiguration({ clientToken, site })

        // v4 intake endpoints
        expect(configuration.isIntakeUrl(`https://rum.${intakeDomain}/api/v2/rum?${intakeParameters}`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://logs.${intakeDomain}/api/v2/logs?${intakeParameters}`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://replay.${intakeDomain}/api/v2/replay?${intakeParameters}`)).toBe(true)

        // pre-v4 intake endpoints
        expect(configuration.isIntakeUrl(`https://rum.${intakeDomain}${v1IntakePath}?${intakeParameters}`)).toBe(true)
        expect(configuration.isIntakeUrl(`https://logs.${intakeDomain}${v1IntakePath}?${intakeParameters}`)).toBe(true)
        expect(
          configuration.isIntakeUrl(`https://rum-http-intake.logs.${site}${v1IntakePath}?${intakeParameters}`)
        ).toBe(true)
        expect(
          configuration.isIntakeUrl(`https://browser-http-intake.logs.${site}${v1IntakePath}?${intakeParameters}`)
        ).toBe(true)
      })
    })

    it('should detect internal analytics intake request for datadoghq.com site', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        internalAnalyticsSubdomain,
      })
      expect(
        configuration.isIntakeUrl(`https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/rum?${intakeParameters}`)
      ).toBe(true)
    })

    it('should not detect non intake request', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.isIntakeUrl('https://www.foo.com')).toBe(false)
    })

    describe('proxy configuration', () => {
      it('should detect proxy intake request', () => {
        let configuration = computeTransportConfiguration({
          clientToken,
          proxy: 'https://www.proxy.com',
        })
        expect(
          configuration.isIntakeUrl(
            `https://www.proxy.com/?ddforward=${encodeURIComponent(`/api/v2/rum?${intakeParameters}`)}`
          )
        ).toBe(true)

        configuration = computeTransportConfiguration({
          clientToken,
          proxy: 'https://www.proxy.com/custom/path',
        })
        expect(
          configuration.isIntakeUrl(
            `https://www.proxy.com/custom/path?ddforward=${encodeURIComponent(`/api/v2/rum?${intakeParameters}`)}`
          )
        ).toBe(true)
      })

      it('should not detect request done on the same host as the proxy', () => {
        const configuration = computeTransportConfiguration({
          clientToken,
          proxy: 'https://www.proxy.com',
        })
        expect(configuration.isIntakeUrl('https://www.proxy.com/foo')).toBe(false)
      })
    })
    ;[
      { site: 'datadoghq.eu' },
      { site: 'us3.datadoghq.com' },
      { site: 'us5.datadoghq.com' },
      { site: 'ap1.datadoghq.com' },
    ].forEach(({ site }) => {
      it(`should detect replica intake request for site ${site}`, () => {
        const configuration = computeTransportConfiguration({
          clientToken,
          site,
          replica: { clientToken },
          internalAnalyticsSubdomain,
        })

        expect(
          configuration.isIntakeUrl(
            `https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/rum?${intakeParameters}`
          )
        ).toBe(true)
        expect(
          configuration.isIntakeUrl(
            `https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/logs?${intakeParameters}`
          )
        ).toBe(true)
        expect(
          configuration.isIntakeUrl(
            `https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/replay?${intakeParameters}`
          )
        ).toBe(true)
      })
    })
  })
})
