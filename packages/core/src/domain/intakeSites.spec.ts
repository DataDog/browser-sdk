import { isIntakeUrl } from './intakeSites'

describe('intakeSites', () => {
  const clientToken = 'some_client_token'
  const internalAnalyticsSubdomain = 'ia-rum-intake'
  const intakeParameters = 'ddsource=browser&dd-api-key=xxxx&dd-request-id=1234567890'

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
