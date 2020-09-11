import { BuildEnv, BuildMode, Datacenter, isIntakeRequest } from '../src'
import { buildConfiguration } from '../src/configuration'

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
    it('should not be available for production env', () => {
      const endpoint = 'bbbbbbbbbbbbbbb'
      const configuration = buildConfiguration(
        { clientToken, rumEndpoint: endpoint, logsEndpoint: endpoint, internalMonitoringEndpoint: endpoint },
        usEnv
      )
      expect(configuration.rumEndpoint).not.toEqual(endpoint)
      expect(configuration.logsEndpoint).not.toEqual(endpoint)
      expect(configuration.internalMonitoringEndpoint).not.toEqual(endpoint)
    })

    it('should be available for e2e-test build mode', () => {
      const endpoint = 'bbbbbbbbbbbbbbb'
      const e2eEnv = {
        buildMode: BuildMode.E2E_TEST,
        datacenter: Datacenter.US,
        sdkVersion: 'some_version',
      }
      const configuration = buildConfiguration(
        { clientToken, rumEndpoint: endpoint, logsEndpoint: endpoint, internalMonitoringEndpoint: endpoint },
        e2eEnv
      )
      expect(configuration.rumEndpoint).toEqual(endpoint)
      expect(configuration.logsEndpoint).toEqual(endpoint)
      expect(configuration.internalMonitoringEndpoint).toEqual(endpoint)
    })
  })

  describe('isCollectingError', () => {
    it('should be enabled by default', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)
      expect(configuration.isCollectingError).toEqual(true)
    })

    it('should be disabled when defined to false', () => {
      const configuration = buildConfiguration({ clientToken, isCollectingError: false }, usEnv)
      expect(configuration.isCollectingError).toEqual(false)
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
      const configuration = buildConfiguration({ clientToken, proxyHost: 'proxy.io' }, usEnv)
      expect(configuration.rumEndpoint).toMatch(/^https:\/\/proxy\.io\//)
      expect(configuration.rumEndpoint).toContain('?ddhost=rum-http-intake.logs.datadoghq.com&')
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

  describe('isIntakeRequest', () => {
    it('should not detect non intake request', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)
      expect(isIntakeRequest('https://www.foo.com', configuration)).toBe(false)
    })

    it('should detect intake request', () => {
      const configuration = buildConfiguration({ clientToken }, usEnv)
      expect(isIntakeRequest('https://rum-http-intake.logs.datadoghq.com', configuration)).toBe(true)
      expect(isIntakeRequest('https://browser-http-intake.logs.datadoghq.com', configuration)).toBe(true)
      expect(isIntakeRequest('https://public-trace-http-intake.logs.datadoghq.com', configuration)).toBe(true)
    })

    it('should detect proxy intake request', () => {
      const configuration = buildConfiguration({ clientToken, proxyHost: 'www.proxy.com' }, usEnv)
      expect(isIntakeRequest('https://www.proxy.com', configuration)).toBe(true)
    })

    it('should detect replica intake request', () => {
      const configuration = buildConfiguration(
        { clientToken, site: 'foo.com', replica: { clientToken } },
        { ...usEnv, buildMode: BuildMode.STAGING }
      )
      expect(isIntakeRequest('https://rum-http-intake.logs.foo.com', configuration)).toBe(true)
      expect(isIntakeRequest('https://browser-http-intake.logs.foo.com', configuration)).toBe(true)
      expect(isIntakeRequest('https://public-trace-http-intake.logs.foo.com', configuration)).toBe(true)

      expect(isIntakeRequest('https://rum-http-intake.logs.datadoghq.com', configuration)).toBe(true)
      expect(isIntakeRequest('https://browser-http-intake.logs.datadoghq.com', configuration)).toBe(true)
    })
  })
})
