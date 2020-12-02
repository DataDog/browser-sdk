import { BuildEnv, BuildMode, Datacenter } from '../boot/init'
import { buildConfiguration } from './configuration'

describe('configuration', () => {
  const clientToken = 'some_client_token'
  const usEnv: BuildEnv = {
    buildMode: BuildMode.RELEASE,
    datacenter: Datacenter.US,
    sdkVersion: 'some_version',
  }

  describe('internal monitoring endpoint', () => {
    it('should only be defined when api key is provided', () => {
      let configuration = buildConfiguration({ clientToken }, usEnv)
      expect(configuration.internalMonitoringEndpoint).toBeUndefined()

      configuration = buildConfiguration({ clientToken, internalMonitoringApiKey: clientToken }, usEnv)
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
      const configuration = buildConfiguration({ clientToken }, e2eEnv)
      expect(configuration.rumEndpoint).toEqual('<<< E2E RUM ENDPOINT >>>')
      expect(configuration.logsEndpoint).toEqual('<<< E2E LOGS ENDPOINT >>>')
      expect(configuration.internalMonitoringEndpoint).toEqual('<<< E2E INTERNAL MONITORING ENDPOINT >>>')
    })
  })

  describe('site', () => {
    it('should use buildEnv value by default', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)
      expect(configuration.rumEndpoint).toContain('datadoghq.com')
    })

    it('should use datacenter value when set', () => {
      const configuration = buildConfiguration({ clientToken, datacenter: Datacenter.EU }, usEnv)
      expect(configuration.rumEndpoint).toContain('datadoghq.eu')
    })

    it('should use site value when set', () => {
      const configuration = buildConfiguration({ clientToken, datacenter: Datacenter.EU, site: 'foo.com' }, usEnv)
      expect(configuration.rumEndpoint).toContain('foo.com')
    })
  })

  describe('proxyHost', () => {
    it('should replace endpoint host add set it as a query parameter', () => {
      const configuration = buildConfiguration({ clientToken, site: 'datadoghq.eu', proxyHost: 'proxy.io' }, usEnv)
      expect(configuration.rumEndpoint).toMatch(/^https:\/\/proxy\.io\//)
      expect(configuration.rumEndpoint).toContain('?ddhost=rum-http-intake.logs.datadoghq.eu&')
    })
  })

  describe('sdk_version, env, version and service', () => {
    it('should not modify the logs and rum endpoints tags when not defined', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)
      expect(configuration.rumEndpoint).toContain(`&ddtags=sdk_version:${usEnv.sdkVersion}`)

      expect(configuration.rumEndpoint).not.toContain(',env:')
      expect(configuration.rumEndpoint).not.toContain(',service:')
      expect(configuration.rumEndpoint).not.toContain(',version:')
      expect(configuration.logsEndpoint).not.toContain(',env:')
      expect(configuration.logsEndpoint).not.toContain(',service:')
      expect(configuration.logsEndpoint).not.toContain(',version:')
    })

    it('should be set as tags in the logs and rum endpoints', () => {
      const configuration = buildConfiguration({ clientToken, env: 'foo', service: 'bar', version: 'baz' }, usEnv)
      expect(configuration.rumEndpoint).toContain(
        `&ddtags=sdk_version:${usEnv.sdkVersion},env:foo,service:bar,version:baz`
      )
      expect(configuration.logsEndpoint).toContain(
        `&ddtags=sdk_version:${usEnv.sdkVersion},env:foo,service:bar,version:baz`
      )
    })
  })

  describe('cookie options', () => {
    it('should not be secure nor crossSite by default', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)
      expect(configuration.cookieOptions).toEqual({ secure: false, crossSite: false })
    })

    it('should be secure when `useSecureSessionCookie` is truthy', () => {
      const configuration = buildConfiguration({ clientToken, useSecureSessionCookie: true }, usEnv)
      expect(configuration.cookieOptions).toEqual({ secure: true, crossSite: false })
    })

    it('should be secure and crossSite when `useCrossSiteSessionCookie` is truthy', () => {
      const configuration = buildConfiguration({ clientToken, useCrossSiteSessionCookie: true }, usEnv)
      expect(configuration.cookieOptions).toEqual({ secure: true, crossSite: true })
    })

    it('should have domain when `trackSessionAcrossSubdomains` is truthy', () => {
      const configuration = buildConfiguration({ clientToken, trackSessionAcrossSubdomains: true }, usEnv)
      expect(configuration.cookieOptions).toEqual({ secure: false, crossSite: false, domain: jasmine.any(String) })
    })
  })

  describe('isIntakeUrl', () => {
    it('should not detect non intake request', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)
      expect(configuration.isIntakeUrl('https://www.foo.com')).toBe(false)
    })

    it('should detect intake request for EU site', () => {
      const configuration = buildConfiguration({ clientToken, site: 'datadoghq.eu' }, usEnv)
      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.eu/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.eu/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://public-trace-http-intake.logs.datadoghq.eu/v1/input/xxx')).toBe(true)
    })

    it('should detect intake request for US site', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)

      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://public-trace-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
    })

    it('should detect alternate intake domains for US site', () => {
      const configuration = buildConfiguration({ clientToken, useAlternateIntakeDomains: true }, usEnv)
      expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://trace.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
    })

    it('should handle sites with subdomains and classic intake', () => {
      const configuration = buildConfiguration({ clientToken, site: 'us3.datadoghq.com' }, usEnv)
      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.us3.datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://browser-http-intake.logs.us3.datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://public-trace-http-intake.logs.us3.datadoghq.com/v1/input/xxx')).toBe(
        true
      )
    })

    it('should handle sites with subdomains and alternate intake', () => {
      const configuration = buildConfiguration(
        { clientToken, site: 'us3.datadoghq.com', useAlternateIntakeDomains: true },
        usEnv
      )
      expect(configuration.isIntakeUrl('https://rum.browser-intake-us3-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-us3-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://trace.browser-intake-us3-datadoghq.com/v1/input/xxx')).toBe(true)
    })

    it('should detect proxy intake request', () => {
      let configuration = buildConfiguration({ clientToken, proxyHost: 'www.proxy.com' }, usEnv)
      expect(configuration.isIntakeUrl('https://www.proxy.com/v1/input/xxx')).toBe(true)
      configuration = buildConfiguration(
        { clientToken, proxyHost: 'www.proxy.com', useAlternateIntakeDomains: true },
        usEnv
      )
      expect(configuration.isIntakeUrl('https://www.proxy.com/v1/input/xxx')).toBe(true)
      configuration = buildConfiguration({ clientToken, proxyHost: 'www.proxy.com/custom/path' }, usEnv)
      expect(configuration.isIntakeUrl('https://www.proxy.com/custom/path/v1/input/xxx')).toBe(true)
    })

    it('should not detect request done on the same host as the proxy', () => {
      const configuration = buildConfiguration({ clientToken, proxyHost: 'www.proxy.com' }, usEnv)
      expect(configuration.isIntakeUrl('https://www.proxy.com/foo')).toBe(false)
    })

    it('should detect replica intake request', () => {
      const configuration = buildConfiguration(
        { clientToken, site: 'foo.com', replica: { clientToken } },
        { ...usEnv, buildMode: BuildMode.STAGING }
      )
      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.foo.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://browser-http-intake.logs.foo.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://public-trace-http-intake.logs.foo.com/v1/input/xxx')).toBe(true)

      expect(configuration.isIntakeUrl('https://rum-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://browser-http-intake.logs.datadoghq.com/v1/input/xxx')).toBe(true)
    })

    it('should detect replica intake request with alternate intake domains', () => {
      const configuration = buildConfiguration(
        { clientToken, site: 'foo.com', replica: { clientToken }, useAlternateIntakeDomains: true },
        { ...usEnv, buildMode: BuildMode.STAGING }
      )
      expect(configuration.isIntakeUrl('https://rum.browser-intake-foo.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-foo.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://trace.browser-intake-foo.com/v1/input/xxx')).toBe(true)

      expect(configuration.isIntakeUrl('https://rum.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
      expect(configuration.isIntakeUrl('https://logs.browser-intake-datadoghq.com/v1/input/xxx')).toBe(true)
    })
  })
})
