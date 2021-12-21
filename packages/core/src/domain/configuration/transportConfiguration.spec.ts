import { BuildEnv, BuildMode } from '@datadog/browser-core'
import { computeTransportConfiguration } from './transportConfiguration'

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'
  const otherClientToken = 'some_other_client_token'
  const v1IntakePath = `/v1/input/${clientToken}`
  const buildEnv: BuildEnv = {
    buildMode: BuildMode.RELEASE,
    sdkVersion: 'some_version',
  }

  describe('internal monitoring endpoint', () => {
    it('should only be defined when api key is provided', () => {
      let configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(configuration.internalMonitoringEndpointBuilder).toBeUndefined()

      configuration = computeTransportConfiguration(
        { clientToken, internalMonitoringApiKey: otherClientToken },
        buildEnv
      )
      expect(configuration.internalMonitoringEndpointBuilder?.build()).toContain(otherClientToken)
    })
  })

  describe('endpoint overload', () => {
    it('should be available for e2e-test build mode', () => {
      const e2eEnv = {
        buildMode: BuildMode.E2E_TEST,
        sdkVersion: 'some_version',
      }
      const configuration = computeTransportConfiguration({ clientToken }, e2eEnv)
      expect(configuration.rumEndpointBuilder.build()).toEqual('<<< E2E RUM ENDPOINT >>>')
      expect(configuration.logsEndpointBuilder.build()).toEqual('<<< E2E LOGS ENDPOINT >>>')
      expect(configuration.internalMonitoringEndpointBuilder?.build()).toEqual(
        '<<< E2E INTERNAL MONITORING ENDPOINT >>>'
      )
      expect(configuration.sessionReplayEndpointBuilder.build()).toEqual('<<< E2E SESSION REPLAY ENDPOINT >>>')

      expect(configuration.isIntakeUrl('<<< E2E RUM ENDPOINT >>>')).toBe(true)
      expect(configuration.isIntakeUrl('<<< E2E LOGS ENDPOINT >>>')).toBe(true)
      expect(configuration.isIntakeUrl('<<< E2E SESSION REPLAY ENDPOINT >>>')).toBe(true)
      expect(configuration.isIntakeUrl('<<< E2E INTERNAL MONITORING ENDPOINT >>>')).toBe(true)
    })
  })

  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(configuration.rumEndpointBuilder.build()).toContain('datadoghq.com')
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'foo.com' }, buildEnv)
      expect(configuration.rumEndpointBuilder.build()).toContain('foo.com')
    })
  })

  describe('query parameters', () => {
    it('should add new intake query parameters when intakeApiVersion 2 is used', () => {
      const configuration = computeTransportConfiguration({ clientToken, intakeApiVersion: 2 }, buildEnv)
      expect(configuration.rumEndpointBuilder.build()).toMatch(
        `&dd-api-key=${clientToken}&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)`
      )
    })

    it('should add batch_time for rum endpoint', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(configuration.rumEndpointBuilder.build()).toContain(`&batch_time=`)
    })

    it('should not add batch_time for logs and replay endpoints', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(configuration.logsEndpointBuilder.build()).not.toContain(`&batch_time=`)
      expect(configuration.sessionReplayEndpointBuilder.build()).not.toContain(`&batch_time=`)
    })
  })

  describe('proxyHost', () => {
    it('should replace endpoint host and add set it as a query parameter', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, site: 'datadoghq.eu', proxyHost: 'proxy.io' },
        buildEnv
      )
      expect(configuration.rumEndpointBuilder.build()).toMatch(
        `https://proxy.io/v1/input/${clientToken}\\?ddhost=rum-http-intake.logs.datadoghq.eu&ddsource=(.*)&ddtags=(.*)`
      )
    })
  })

  describe('proxyUrl', () => {
    it(' should replace the full intake v1 endpoint by the proxyUrl and set it in the attribute ddforward', () => {
      const configuration = computeTransportConfiguration({ clientToken, proxyUrl: 'https://proxy.io/path' }, buildEnv)
      expect(configuration.rumEndpointBuilder.build()).toMatch(
        `https://proxy.io/path\\?ddforward=${encodeURIComponent(
          `https://rum-http-intake.logs.datadoghq.com/v1/input/${clientToken}?ddsource=(.*)&ddtags=(.*)`
        )}`
      )
    })

    it('should replace the full intake v2 endpoint by the proxyUrl and set it in the attribute ddforward', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, intakeApiVersion: 2, proxyUrl: 'https://proxy.io/path' },
        buildEnv
      )
      expect(configuration.rumEndpointBuilder.build()).toMatch(
        `https://proxy.io/path\\?ddforward=${encodeURIComponent(
          `https://rum-http-intake.logs.datadoghq.com/api/v2/rum?ddsource=(.*)&ddtags=(.*)&dd-api-key=${clientToken}` +
            `&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)&batch_time=(.*)`
        )}`
      )
    })
  })

  describe('sdk_version, env, version and service', () => {
    it('should not modify the logs and rum endpoints tags when not defined', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).toContain(
        `&ddtags=sdk_version:${buildEnv.sdkVersion}`
      )

      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).not.toContain(',env:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).not.toContain(',service:')
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).not.toContain(',version:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build())).not.toContain(',env:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build())).not.toContain(',service:')
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build())).not.toContain(',version:')
    })

    it('should be set as tags in the logs and rum endpoints', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, env: 'foo', service: 'bar', version: 'baz' },
        buildEnv
      )
      expect(decodeURIComponent(configuration.rumEndpointBuilder.build())).toContain(
        `&ddtags=sdk_version:${buildEnv.sdkVersion},env:foo,service:bar,version:baz`
      )
      expect(decodeURIComponent(configuration.logsEndpointBuilder.build())).toContain(
        `&ddtags=sdk_version:${buildEnv.sdkVersion},env:foo,service:bar,version:baz`
      )
    })
  })

  describe('tags', () => {
    it('should be encoded', () => {
      const configuration = computeTransportConfiguration({ clientToken, service: 'bar+foo' }, buildEnv)
      expect(configuration.rumEndpointBuilder.build()).toContain(
        `ddtags=sdk_version%3Asome_version%2Cservice%3Abar%2Bfoo`
      )
    })
  })

  describe('isIntakeUrl with intakeApiVersion: 1', () => {
    it('should not detect non intake request', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(configuration.isIntakeUrl('https://www.foo.com')).toBe(false)
    })

    it('should detect intake request for classic EU site', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'datadoghq.eu' }, buildEnv)
      expect(configuration.isIntakeUrl(`https://rum-http-intake.logs.datadoghq.eu${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://browser-http-intake.logs.datadoghq.eu${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.eu/api/v2/replay?xxx`)).toBe(
        true
      )
    })

    it('should detect intake request for classic US site', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)

      expect(configuration.isIntakeUrl(`https://rum-http-intake.logs.datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://browser-http-intake.logs.datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.com/api/v2/replay?xxx`)).toBe(
        true
      )
    })

    it('should detect alternate intake domains for US site', () => {
      const configuration = computeTransportConfiguration({ clientToken, useAlternateIntakeDomains: true }, buildEnv)
      expect(configuration.isIntakeUrl(`https://rum.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://logs.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.com/api/v2/replay?xxx`)).toBe(
        true
      )
    })

    it('should detect alternate intake domains for EU site', () => {
      const configuration = computeTransportConfiguration({ clientToken, useAlternateIntakeDomains: true }, buildEnv)
      expect(configuration.isIntakeUrl(`https://rum.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://logs.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.com/api/v2/replay?xxx`)).toBe(
        true
      )
    })

    it('should force alternate intake domains for other sites', () => {
      let configuration = computeTransportConfiguration(
        { clientToken, site: 'us3.datadoghq.com', useAlternateIntakeDomains: false },
        buildEnv
      )
      expect(configuration.isIntakeUrl(`https://rum.browser-intake-us3-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://rum-http-intake.logs.us3.datadoghq.com${v1IntakePath}?xxx`)).toBe(false)

      configuration = computeTransportConfiguration(
        { clientToken, site: 'ddog-gov.com', useAlternateIntakeDomains: false },
        buildEnv
      )
      expect(configuration.isIntakeUrl(`https://rum.browser-intake-ddog-gov.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://rum-http-intake.logs.ddog-gov.com${v1IntakePath}?xxx`)).toBe(false)
    })

    it('should handle sites with subdomains', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'foo.datadoghq.com' }, buildEnv)
      expect(configuration.isIntakeUrl(`https://rum.browser-intake-foo-datadoghq.com/api/v2/rum?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://logs.browser-intake-foo-datadoghq.com/api/v2/logs?xxx`)).toBe(true)
      expect(
        configuration.isIntakeUrl(`https://session-replay.browser-intake-foo-datadoghq.com/api/v2/replay?xxx`)
      ).toBe(true)
    })

    it('should detect proxy intake request with proxyHost', () => {
      let configuration = computeTransportConfiguration({ clientToken, proxyHost: 'www.proxy.com' }, buildEnv)
      expect(configuration.isIntakeUrl(`https://www.proxy.com${v1IntakePath}?xxx`)).toBe(true)
      configuration = computeTransportConfiguration(
        { clientToken, proxyHost: 'www.proxy.com', useAlternateIntakeDomains: true },
        buildEnv
      )
      expect(configuration.isIntakeUrl(`https://www.proxy.com${v1IntakePath}?xxx`)).toBe(true)
      configuration = computeTransportConfiguration({ clientToken, proxyHost: 'www.proxy.com/custom/path' }, buildEnv)
      expect(configuration.isIntakeUrl(`https://www.proxy.com/custom/path${v1IntakePath}?xxx`)).toBe(true)
    })

    it('should not detect request done on the same host as the proxy with proxyHost', () => {
      const configuration = computeTransportConfiguration({ clientToken, proxyHost: 'www.proxy.com' }, buildEnv)
      expect(configuration.isIntakeUrl('https://www.proxy.com/foo')).toBe(false)
    })

    it('should detect proxy intake request with proxyUrl', () => {
      let configuration = computeTransportConfiguration({ clientToken, proxyUrl: 'https://www.proxy.com' }, buildEnv)
      expect(configuration.isIntakeUrl(`https://www.proxy.com/?ddforward=xxx`)).toBe(true)

      configuration = computeTransportConfiguration(
        { clientToken, proxyUrl: 'https://www.proxy.com/custom/path' },
        buildEnv
      )
      expect(configuration.isIntakeUrl(`https://www.proxy.com/custom/path?ddforward=xxx`)).toBe(true)
    })

    it('should not detect request done on the same host as the proxy with proxyUrl', () => {
      const configuration = computeTransportConfiguration({ clientToken, proxyUrl: 'https://www.proxy.com' }, buildEnv)
      expect(configuration.isIntakeUrl('https://www.proxy.com/foo')).toBe(false)
    })

    it('should detect replica intake request with alternate intake domains and intake v2', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, site: 'datadoghq.eu', replica: { clientToken } },
        { ...buildEnv, buildMode: BuildMode.STAGING }
      )
      expect(configuration.isIntakeUrl(`https://rum-http-intake.logs.datadoghq.eu${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://browser-http-intake.logs.datadoghq.eu${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.eu/api/v2/replay?xxx`)).toBe(
        true
      )

      expect(configuration.isIntakeUrl(`https://rum.browser-intake-datadoghq.com/api/v2/rum?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://logs.browser-intake-datadoghq.com/api/v2/logs?xxx`)).toBe(true)
    })

    describe('on us5', () => {
      it('should force alternate domains intake v2', () => {
        const configuration = computeTransportConfiguration({ clientToken, site: 'us5.datadoghq.com' }, buildEnv)
        expect(configuration.isIntakeUrl('https://rum.browser-intake-us5-datadoghq.com/api/v2/rum?xxx')).toBe(true)
        expect(configuration.isIntakeUrl('https://logs.browser-intake-us5-datadoghq.com/api/v2/logs?xxx')).toBe(true)
      })
    })

    describe('when session-replay on all env', () => {
      it('should force alternate domains intake v2', () => {
        let configuration = computeTransportConfiguration({ clientToken }, buildEnv)
        expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.com/api/v2/replay?xxx')).toBe(
          true
        )

        configuration = computeTransportConfiguration({ clientToken, site: 'datadoghq.eu' }, buildEnv)
        expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.eu/api/v2/replay?xxx')).toBe(
          true
        )

        configuration = computeTransportConfiguration({ clientToken, site: 'us3.datadoghq.com' }, buildEnv)
        expect(
          configuration.isIntakeUrl('https://session-replay.browser-intake-us3-datadoghq.com/api/v2/replay?xxx')
        ).toBe(true)

        configuration = computeTransportConfiguration({ clientToken, site: 'ddog-gov.com' }, buildEnv)
        expect(configuration.isIntakeUrl('https://session-replay.browser-intake-ddog-gov.com/api/v2/replay?xxx')).toBe(
          true
        )

        configuration = computeTransportConfiguration({ clientToken, site: 'us5.datadoghq.com' }, buildEnv)
        expect(
          configuration.isIntakeUrl('https://session-replay.browser-intake-us5-datadoghq.com/api/v2/replay?xxx')
        ).toBe(true)
      })
    })
  })

  describe('isIntakeUrl with intakeApiVersion: 2', () => {
    describe('when RUM or Logs', () => {
      describe('on us1 and eu1', () => {
        it('should detect classic domains intake v2', () => {
          let configuration = computeTransportConfiguration({ clientToken, intakeApiVersion: 2 }, buildEnv)
          expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.com/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.com/api/v2/logs?xxx')).toBe(true)

          configuration = computeTransportConfiguration(
            { clientToken, site: 'datadoghq.eu', intakeApiVersion: 2 },
            buildEnv
          )
          expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.eu/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.eu/api/v2/logs?xxx')).toBe(true)
        })

        it('should detect alternate domains intake v2', () => {
          let configuration = computeTransportConfiguration(
            { clientToken, useAlternateIntakeDomains: true, intakeApiVersion: 2 },
            buildEnv
          )
          expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.com/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.com/api/v2/logs?xxx')).toBe(true)

          configuration = computeTransportConfiguration(
            { clientToken, site: 'datadoghq.eu', useAlternateIntakeDomains: true, intakeApiVersion: 2 },
            buildEnv
          )
          expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.eu/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.eu/api/v2/logs?xxx')).toBe(true)
        })
      })

      describe('on us3 and gov', () => {
        it('should detect alternate domains intake v2', () => {
          let configuration = computeTransportConfiguration(
            { clientToken, site: 'us3.datadoghq.com', intakeApiVersion: 2 },
            buildEnv
          )
          expect(configuration.isIntakeUrl('https://rum.browser-intake-us3-datadoghq.com/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://logs.browser-intake-us3-datadoghq.com/api/v2/logs?xxx')).toBe(true)

          configuration = computeTransportConfiguration(
            { clientToken, site: 'ddog-gov.com', intakeApiVersion: 2 },
            buildEnv
          )
          expect(configuration.isIntakeUrl('https://rum.browser-intake-ddog-gov.com/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://rum-http-intake.logs.ddog-gov.com/api/v2/logs?xxx')).toBe(false)
        })
      })
    })
  })
})
