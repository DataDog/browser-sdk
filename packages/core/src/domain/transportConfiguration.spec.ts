import { BuildEnv, BuildMode, Datacenter } from '@datadog/browser-core'
import { computeTransportConfiguration } from './transportConfiguration'

describe('transportConfiguration', () => {
  const clientToken = 'some_client_token'
  const usEnv: BuildEnv = {
    buildMode: BuildMode.RELEASE,
    datacenter: Datacenter.US,
    sdkVersion: 'some_version',
  }

  describe('internal monitoring endpoint', () => {
    it('should only be defined when api key is provided', () => {
      let configuration = computeTransportConfiguration({ clientToken }, usEnv)
      expect(configuration.internalMonitoringEndpoint).toBeUndefined()

      configuration = computeTransportConfiguration({ clientToken, internalMonitoringApiKey: clientToken }, usEnv)
      expect(configuration.internalMonitoringEndpoint).toContain(clientToken)
    })
  })

  describe('endpoint overload', () => {
    it('should be available for e2e-test build mode', () => {
      const e2eEnv = {
        buildMode: BuildMode.E2E_TEST,
        datacenter: Datacenter.US,
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
    it('should use buildEnv value by default', () => {
      const configuration = computeTransportConfiguration({ clientToken }, usEnv)
      expect(configuration.rumEndpoint).toContain('datadoghq.com')
    })

    it('should use datacenter value when set', () => {
      const configuration = computeTransportConfiguration({ clientToken, datacenter: Datacenter.EU }, usEnv)
      expect(configuration.rumEndpoint).toContain('datadoghq.eu')
    })

    it('should use site value when set', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, datacenter: Datacenter.EU, site: 'foo.com' },
        usEnv
      )
      expect(configuration.rumEndpoint).toContain('foo.com')
    })
  })

  describe('proxyHost', () => {
    it('should replace endpoint host add set it as a query parameter', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, site: 'datadoghq.eu', proxyHost: 'proxy.io' },
        usEnv
      )
      expect(configuration.rumEndpoint).toMatch(/^https:\/\/proxy\.io\//)
      expect(configuration.rumEndpoint).toContain('?ddhost=rum-http-intake.logs.datadoghq.eu&')
    })
  })

  describe('sdk_version, env, version and service', () => {
    it('should not modify the logs and rum endpoints tags when not defined', () => {
      const configuration = computeTransportConfiguration({ clientToken }, usEnv)
      expect(decodeURIComponent(configuration.rumEndpoint)).toContain(`&ddtags=sdk_version:${usEnv.sdkVersion}`)

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
        usEnv
      )
      expect(decodeURIComponent(configuration.rumEndpoint)).toContain(
        `&ddtags=sdk_version:${usEnv.sdkVersion},env:foo,service:bar,version:baz`
      )
      expect(decodeURIComponent(configuration.logsEndpoint)).toContain(
        `&ddtags=sdk_version:${usEnv.sdkVersion},env:foo,service:bar,version:baz`
      )
    })
  })

  describe('tags', () => {
    it('should be encoded', () => {
      const configuration = computeTransportConfiguration({ clientToken, service: 'bar+foo' }, usEnv)
      expect(configuration.rumEndpoint).toContain(`ddtags=sdk_version%3Asome_version%2Cservice%3Abar%2Bfoo`)
    })
  })

  describe('isIntakeUrl', () => {
    it('should not detect non intake request', () => {
      const configuration = computeTransportConfiguration({ clientToken }, usEnv)
      expect(configuration.isIntakeUrl('https://www.foo.com')).toBe(false)
    })

    it('should detect intake request for classic EU site', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'datadoghq.eu' }, usEnv)
      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.eu/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.eu/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://public-trace-http-intake.logs.datadoghq.eu/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.eu/v1/input/xxx')).toBe(true)
    })

    it('should detect intake request for classic US site', () => {
      const configuration = computeTransportConfiguration({ clientToken }, usEnv)

      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://public-trace-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
    })

    it('should detect alternate intake domains for US site', () => {
      const configuration = computeTransportConfiguration({ clientToken, useAlternateIntakeDomains: true }, usEnv)
      expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://trace.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
    })

    it('should detect alternate intake domains for EU site', () => {
      const configuration = computeTransportConfiguration({ clientToken, useAlternateIntakeDomains: true }, usEnv)
      expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://trace.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
    })

    it('should force alternate intake domains for other sites', () => {
      let configuration = computeTransportConfiguration(
        { clientToken, site: 'us3.datadoghq.com', useAlternateIntakeDomains: false },
        usEnv
      )
      expect(configuration.isIntakeUrl('https://rum.browser-intake-us3-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.us3.datadoghq.com/v1/input/xxx')).toBe(false)

      configuration = computeTransportConfiguration(
        { clientToken, site: 'ddog-gov.com', useAlternateIntakeDomains: false },
        usEnv
      )
      expect(configuration.isIntakeUrl('https://rum.browser-intake-ddog-gov.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.ddog-gov.com/v1/input/xxx')).toBe(false)
    })

    it('should handle sites with subdomains', () => {
      const configuration = computeTransportConfiguration({ clientToken, site: 'foo.datadoghq.com' }, usEnv)
      expect(configuration.isIntakeUrl('https://rum.browser-intake-foo-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-foo-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://trace.browser-intake-foo-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://session-replay.browser-intake-foo-datadoghq.com/v1/input/xxx')).toBe(
        true
      )
    })

    it('should detect proxy intake request', () => {
      let configuration = computeTransportConfiguration({ clientToken, proxyHost: 'www.proxy.com' }, usEnv)
      expect(configuration.isIntakeUrl('https://www.proxy.com/v1/input/xxx')).toBe(true)
      configuration = computeTransportConfiguration(
        { clientToken, proxyHost: 'www.proxy.com', useAlternateIntakeDomains: true },
        usEnv
      )
      expect(configuration.isIntakeUrl('https://www.proxy.com/v1/input/xxx')).toBe(true)
      configuration = computeTransportConfiguration({ clientToken, proxyHost: 'www.proxy.com/custom/path' }, usEnv)
      expect(configuration.isIntakeUrl('https://www.proxy.com/custom/path/v1/input/xxx')).toBe(true)
    })

    it('should not detect request done on the same host as the proxy', () => {
      const configuration = computeTransportConfiguration({ clientToken, proxyHost: 'www.proxy.com' }, usEnv)
      expect(configuration.isIntakeUrl('https://www.proxy.com/foo')).toBe(false)
    })

    it('should detect replica intake request with classic intake domains', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, site: 'datadoghq.eu', replica: { clientToken } },
        { ...usEnv, buildMode: BuildMode.STAGING }
      )
      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.eu/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.eu/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://public-trace-http-intake.logs.datadoghq.eu/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://session-replay.browser-intake-datadoghq.eu/v1/input/xxx')).toBe(true)

      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
    })

    it('should detect replica intake request with alternate intake domains', () => {
      const configuration = computeTransportConfiguration(
        { clientToken, site: 'foo.com', replica: { clientToken } },
        { ...usEnv, buildMode: BuildMode.STAGING }
      )
      expect(configuration.isIntakeUrl('https://rum.browser-intake-foo.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-foo.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://trace.browser-intake-foo.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://session-replay.browser-intake-foo.com/v1/input/xxx')).toBe(true)

      expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
    })
  })
})
