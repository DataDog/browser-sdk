import { BuildEnv, BuildMode } from '@datadog/browser-core'
import { computeTransportConfiguration } from './transportConfiguration'

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'
  const v1IntakePath = `/v1/input/${clientToken}`
  const buildEnv: BuildEnv = {
    buildMode: BuildMode.RELEASE,
    sdkVersion: 'some_version',
  }

  describe('internal monitoring endpoint', () => {
    it('should only be defined when api key is provided', () => {
      let configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(configuration.internalMonitoringEndpoint).toBeUndefined()

      configuration = computeTransportConfiguration({ clientToken, internalMonitoringApiKey: clientToken }, buildEnv)
      expect(configuration.internalMonitoringEndpoint).toContain(clientToken)
    })
  })

  describe('endpoint overload', () => {
    it('should be available for e2e-test build mode', () => {
      const e2eEnv = {
        buildMode: BuildMode.E2E_TEST,
        sdkVersion: 'some_version',
      }
      const configuration = computeTransportConfiguration({ clientToken }, e2eEnv)
      expect(configuration.rumEndpoint).toEqual('<<< E2E RUM ENDPOINT >>>')
      expect(configuration.logsEndpoint).toEqual('<<< E2E LOGS ENDPOINT >>>')
      expect(configuration.internalMonitoringEndpoint).toEqual('<<< E2E INTERNAL MONITORING ENDPOINT >>>')
      expect(configuration.sessionReplayEndpoint).toEqual('<<< E2E SESSION REPLAY ENDPOINT >>>')
    })
  })

  describe('site', () => {
    it('should use US site by default', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(configuration.rumEndpoint).toContain('datadoghq.com')
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'foo.com' }, buildEnv)
      expect(configuration.rumEndpoint).toContain('foo.com')
    })
  })

  describe('query parameters', () => {
    it('should add new intake query parameters when "support-intake-v2" enabled', () => {
      const configuration = computeTransportConfiguration({ clientToken, intakeApiVersion: 2 }, buildEnv, true)
      expect(configuration.rumEndpoint).toMatch(
        `&dd-api-key=${clientToken}&dd-evp-origin-version=(.*)&dd-evp-origin=browser`
      )
    })
  })

  describe('proxyHost', () => {
    it('should replace endpoint host and add set it as a query parameter', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, site: 'datadoghq.eu', proxyHost: 'proxy.io' },
        buildEnv
      )
      expect(configuration.rumEndpoint).toMatch(
        `https://proxy.io/v1/input/${clientToken}\\?ddhost=rum-http-intake.logs.datadoghq.eu&ddsource=(.*)&ddtags=(.*)`
      )
    })
  })

  describe('proxyUrl', () => {
    it('should replace the full endpoint by the proxyUrl and set it in the attribute ddforward', () => {
      const configuration = computeTransportConfiguration({ clientToken, proxyUrl: 'https://proxy.io/path' }, buildEnv)
      expect(configuration.rumEndpoint).toMatch(
        `https://proxy.io/path\\?ddforward=${encodeURIComponent(
          `https://rum-http-intake.logs.datadoghq.com/v1/input/${clientToken}?ddsource=(.*)&ddtags=(.*)`
        )}`
      )
    })
  })

  describe('sdk_version, env, version and service', () => {
    it('should not modify the logs and rum endpoints tags when not defined', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(decodeURIComponent(configuration.rumEndpoint)).toContain(`&ddtags=sdk_version:${buildEnv.sdkVersion}`)

      expect(decodeURIComponent(configuration.rumEndpoint)).not.toContain(',env:')
      expect(decodeURIComponent(configuration.rumEndpoint)).not.toContain(',service:')
      expect(decodeURIComponent(configuration.rumEndpoint)).not.toContain(',version:')
      expect(decodeURIComponent(configuration.logsEndpoint)).not.toContain(',env:')
      expect(decodeURIComponent(configuration.logsEndpoint)).not.toContain(',service:')
      expect(decodeURIComponent(configuration.logsEndpoint)).not.toContain(',version:')
    })

    it('should be set as tags in the logs and rum endpoints', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, env: 'foo', service: 'bar', version: 'baz' },
        buildEnv
      )
      expect(decodeURIComponent(configuration.rumEndpoint)).toContain(
        `&ddtags=sdk_version:${buildEnv.sdkVersion},env:foo,service:bar,version:baz`
      )
      expect(decodeURIComponent(configuration.logsEndpoint)).toContain(
        `&ddtags=sdk_version:${buildEnv.sdkVersion},env:foo,service:bar,version:baz`
      )
    })
  })

  describe('tags', () => {
    it('should be encoded', () => {
      const configuration = computeTransportConfiguration({ clientToken, service: 'bar+foo' }, buildEnv)
      expect(configuration.rumEndpoint).toContain(`ddtags=sdk_version%3Asome_version%2Cservice%3Abar%2Bfoo`)
    })
  })

  describe('isIntakeUrl when "support-intake-v2" disabled', () => {
    it('should not detect non intake request', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)
      expect(configuration.isIntakeUrl('https://www.foo.com')).toBe(false)
    })

    it('should detect intake request for classic EU site', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'datadoghq.eu' }, buildEnv)
      expect(configuration.isIntakeUrl(`https://rum-http-intake.logs.datadoghq.eu${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://browser-http-intake.logs.datadoghq.eu${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.eu${v1IntakePath}?xxx`)).toBe(
        true
      )
    })

    it('should detect intake request for classic US site', () => {
      const configuration = computeTransportConfiguration({ clientToken }, buildEnv)

      expect(configuration.isIntakeUrl(`https://rum-http-intake.logs.datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://browser-http-intake.logs.datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(
        true
      )
    })

    it('should detect alternate intake domains for US site', () => {
      const configuration = computeTransportConfiguration({ clientToken, useAlternateIntakeDomains: true }, buildEnv)
      expect(configuration.isIntakeUrl(`https://rum.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://logs.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(
        true
      )
    })

    it('should detect alternate intake domains for EU site', () => {
      const configuration = computeTransportConfiguration({ clientToken, useAlternateIntakeDomains: true }, buildEnv)
      expect(configuration.isIntakeUrl(`https://rum.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://logs.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(
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
      expect(configuration.isIntakeUrl(`https://rum.browser-intake-foo-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://logs.browser-intake-foo-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(
        configuration.isIntakeUrl(`https://session-replay.browser-intake-foo-datadoghq.com${v1IntakePath}?xxx`)
      ).toBe(true)
    })

    it('should detect proxy intake request', () => {
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

    it('should not detect request done on the same host as the proxy', () => {
      const configuration = computeTransportConfiguration({ clientToken, proxyHost: 'www.proxy.com' }, buildEnv)
      expect(configuration.isIntakeUrl('https://www.proxy.com/foo')).toBe(false)
    })

    it('should detect replica intake request with alternate intake domains', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, site: 'foo.com', replica: { clientToken } },
        { ...buildEnv, buildMode: BuildMode.STAGING }
      )
      expect(configuration.isIntakeUrl(`https://rum.browser-intake-foo.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://logs.browser-intake-foo.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-foo.com${v1IntakePath}?xxx`)).toBe(true)

      expect(configuration.isIntakeUrl(`https://rum.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://logs.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
    })

    it('should force intake v1 when "support-intake-v2" disabled', () => {
      const configuration = computeTransportConfiguration({ clientToken, intakeApiVersion: 2 }, buildEnv)
      expect(configuration.isIntakeUrl(`https://rum-http-intake.logs.datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://browser-http-intake.logs.datadoghq.com${v1IntakePath}?xxx`)).toBe(true)
      expect(configuration.isIntakeUrl(`https://session-replay.browser-intake-datadoghq.com${v1IntakePath}?xxx`)).toBe(
        true
      )
    })
  })

  describe('isIntakeUrl when "support-intake-v2" enabled', () => {
    describe('when RUM or Logs', () => {
      describe('on us1 and eu1', () => {
        it('should detect classic domains intake v2', () => {
          let configuration = computeTransportConfiguration({ clientToken, intakeApiVersion: 2 }, buildEnv, true)
          expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.com/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.com/api/v2/logs?xxx')).toBe(true)

          configuration = computeTransportConfiguration(
            { clientToken, site: 'datadoghq.eu', intakeApiVersion: 2 },
            buildEnv,
            true
          )
          expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.eu/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.eu/api/v2/logs?xxx')).toBe(true)
        })

        it('should detect alternate domains intake v2', () => {
          let configuration = computeTransportConfiguration(
            { clientToken, useAlternateIntakeDomains: true, intakeApiVersion: 2 },
            buildEnv,
            true
          )
          expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.com/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.com/api/v2/logs?xxx')).toBe(true)

          configuration = computeTransportConfiguration(
            { clientToken, site: 'datadoghq.eu', useAlternateIntakeDomains: true, intakeApiVersion: 2 },
            buildEnv,
            true
          )
          expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.eu/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.eu/api/v2/logs?xxx')).toBe(true)
        })
      })

      describe('on us3 and gov', () => {
        it('should detect alternate domains intake v2', () => {
          let configuration = computeTransportConfiguration(
            { clientToken, site: 'us3.datadoghq.com', intakeApiVersion: 2 },
            buildEnv,
            true
          )
          expect(configuration.isIntakeUrl('https://rum.browser-intake-us3-datadoghq.com/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://logs.browser-intake-us3-datadoghq.com/api/v2/logs?xxx')).toBe(true)

          configuration = computeTransportConfiguration(
            { clientToken, site: 'ddog-gov.com', intakeApiVersion: 2 },
            buildEnv,
            true
          )
          expect(configuration.isIntakeUrl('https://rum.browser-intake-ddog-gov.com/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://rum-http-intake.logs.ddog-gov.com/api/v2/logs?xxx')).toBe(false)
        })
      })

      describe('on us5', () => {
        it('should force alternate domains intake v2', () => {
          const configuration = computeTransportConfiguration(
            { clientToken, site: 'us5.datadoghq.com' },
            buildEnv,
            true
          )
          expect(configuration.isIntakeUrl('https://rum.browser-intake-us5-datadoghq.com/api/v2/rum?xxx')).toBe(true)
          expect(configuration.isIntakeUrl('https://logs.browser-intake-us5-datadoghq.com/api/v2/logs?xxx')).toBe(true)
        })
      })
    })

    describe('when session-replay on all env', () => {
      it('should force alternate domains intake v2', () => {
        let configuration = computeTransportConfiguration({ clientToken }, buildEnv, true)
        expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.com/api/v2/replay?xxx')).toBe(
          true
        )

        configuration = computeTransportConfiguration({ clientToken, site: 'datadoghq.eu' }, buildEnv, true)
        expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.eu/api/v2/replay?xxx')).toBe(
          true
        )

        configuration = computeTransportConfiguration({ clientToken, site: 'us3.datadoghq.com' }, buildEnv, true)
        expect(
          configuration.isIntakeUrl('https://session-replay.browser-intake-us3-datadoghq.com/api/v2/replay?xxx')
        ).toBe(true)

        configuration = computeTransportConfiguration({ clientToken, site: 'ddog-gov.com' }, buildEnv, true)
        expect(configuration.isIntakeUrl('https://session-replay.browser-intake-ddog-gov.com/api/v2/replay?xxx')).toBe(
          true
        )

        configuration = computeTransportConfiguration({ clientToken, site: 'us5.datadoghq.com' }, buildEnv, true)
        expect(
          configuration.isIntakeUrl('https://session-replay.browser-intake-us5-datadoghq.com/api/v2/replay?xxx')
        ).toBe(true)
      })
    })

    it('should detect replica intake request with alternate intake domains version 2', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, site: 'foo.com', replica: { clientToken } },
        { ...buildEnv, buildMode: BuildMode.STAGING },
        true
      )
      expect(configuration.isIntakeUrl('https://rum.browser-intake-foo.com/api/v2/rum?xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-foo.com/api/v2/logs?xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://session-replay.browser-intake-foo.com/api/v2/replay?xxx')).toBe(true)

      expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.com/api/v2/rum?xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.com/api/v2/logs?xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.com/api/v2/replay?xxx')).toBe(
        true
      )
    })
  })
})
