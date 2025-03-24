import type { Payload } from '../../transport'
import { computeTransportConfiguration, isIntakeUrl } from './transportConfiguration'
import { INTAKE_SITE_FED_STAGING } from './intakeSites'

const DEFAULT_PAYLOAD = {} as Payload

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'
  const internalAnalyticsSubdomain = 'ia-rum-intake'
  const intakeParameters = 'ddsource=browser&ddtags=sdk_version'

  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain('datadoghq.com')
      expect(configuration.site).toBe('datadoghq.com')
    })

    it('should use logs intake domain for fed staging', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: INTAKE_SITE_FED_STAGING })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain(
        'http-intake.logs.dd0g-gov.com'
      )
      expect(configuration.site).toBe(INTAKE_SITE_FED_STAGING)
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'datadoghq.com' })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain('datadoghq.com')
      expect(configuration.site).toBe('datadoghq.com')
    })
  })

  describe('internalAnalyticsSubdomain', () => {
    it('should use internal analytics subdomain value when set for datadoghq.com site', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).toContain(internalAnalyticsSubdomain)
    })

    it('should not use internal analytics subdomain value when set for other sites', () => {
      const configuration = computeTransportConfiguration({
        clientToken,
        site: 'us3.datadoghq.com',
        internalAnalyticsSubdomain,
      })
      expect(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD)).not.toContain(internalAnalyticsSubdomain)
    })
  })

  describe('sdk_version, env, version and service', () => {
    it('should not modify the logs and rum endpoints tags when not defined', () => {
      const configuration = computeTransportConfiguration({ clientToken })
      const rumEndpoint = decodeURIComponent(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD))
      expect(rumEndpoint).not.toContain(',env:')
      expect(rumEndpoint).not.toContain(',service:')
      expect(rumEndpoint).not.toContain(',version:')
      expect(rumEndpoint).not.toContain(',datacenter:')

      const logsEndpoint = decodeURIComponent(configuration.logsEndpointBuilder.build('fetch', DEFAULT_PAYLOAD))
      expect(logsEndpoint).not.toContain(',env:')
      expect(logsEndpoint).not.toContain(',service:')
      expect(logsEndpoint).not.toContain(',version:')
      expect(logsEndpoint).not.toContain(',datacenter:')
    })

    it('should be set as tags in the logs and rum endpoints', () => {
      const configuration = computeTransportConfiguration({ clientToken, env: 'foo', service: 'bar', version: 'baz' })
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build('fetch', DEFAULT_PAYLOAD))).toContain(
        'env:foo,service:bar,version:baz'
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build('fetch', DEFAULT_PAYLOAD))).toContain(
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
      it(`should detect intake request to ${intakeDomain} for site ${site}`, () => {
        expect(isIntakeUrl(`https://${intakeDomain}/api/v2/rum?${intakeParameters}`)).toBe(true)
        expect(isIntakeUrl(`https://${intakeDomain}/api/v2/logs?${intakeParameters}`)).toBe(true)
        expect(isIntakeUrl(`https://${intakeDomain}/api/v2/replay?${intakeParameters}`)).toBe(true)
      })

      it(`should detect older versions of the ${site} site for intake domain ${intakeDomain}`, () => {
        // v4 intake endpoints
        expect(isIntakeUrl(`https://rum.${intakeDomain}/api/v2/rum?${intakeParameters}`)).toBe(true)
        expect(isIntakeUrl(`https://logs.${intakeDomain}/api/v2/logs?${intakeParameters}`)).toBe(true)
        expect(isIntakeUrl(`https://replay.${intakeDomain}/api/v2/replay?${intakeParameters}`)).toBe(true)

        // pre-v4 intake endpoints
        expect(isIntakeUrl(`https://rum.${intakeDomain}${v1IntakePath}?${intakeParameters}`)).toBe(true)
        expect(isIntakeUrl(`https://logs.${intakeDomain}${v1IntakePath}?${intakeParameters}`)).toBe(true)
        expect(isIntakeUrl(`https://rum-http-intake.logs.${site}${v1IntakePath}?${intakeParameters}`)).toBe(true)
        expect(isIntakeUrl(`https://browser-http-intake.logs.${site}${v1IntakePath}?${intakeParameters}`)).toBe(true)
      })
    })

    it('should detect internal analytics intake request for datadoghq.com site', () => {
      expect(isIntakeUrl(`https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/rum?${intakeParameters}`)).toBe(
        true
      )
    })

    it('should not detect non intake request', () => {
      expect(isIntakeUrl('https://www.foo.com')).toBe(false)
    })

    describe('proxy configuration', () => {
      it('should detect proxy intake request', () => {
        expect(
          isIntakeUrl(`https://www.proxy.com/?ddforward=${encodeURIComponent(`/api/v2/rum?${intakeParameters}`)}`)
        ).toBe(true)
        expect(
          isIntakeUrl(
            `https://www.proxy.com/custom/path?ddforward=${encodeURIComponent(`/api/v2/rum?${intakeParameters}`)}`
          )
        ).toBe(true)
      })

      it('should not detect request done on the same host as the proxy', () => {
        expect(isIntakeUrl('https://www.proxy.com/foo')).toBe(false)
      })
    })
    ;[
      { site: 'datadoghq.eu' },
      { site: 'us3.datadoghq.com' },
      { site: 'us5.datadoghq.com' },
      { site: 'ap1.datadoghq.com' },
    ].forEach(({ site }) => {
      it(`should detect replica intake request for site ${site}`, () => {
        expect(isIntakeUrl(`https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/rum?${intakeParameters}`)).toBe(
          true
        )
        expect(isIntakeUrl(`https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/logs?${intakeParameters}`)).toBe(
          true
        )
        expect(
          isIntakeUrl(`https://${internalAnalyticsSubdomain}.datadoghq.com/api/v2/replay?${intakeParameters}`)
        ).toBe(true)
      })
    })
  })
})
