import { beforeEach, describe, expect, it } from 'vitest'
import type { EndpointPayload } from '@datadog/js-core/transport'
import { buildEndpointUrl, createEndpointBuilder, createReplicaEndpointBuilder } from '@datadog/js-core/transport'
import type { InitConfiguration } from './configuration'
import { validateAndBuildConfiguration } from './configuration'

const DEFAULT_PAYLOAD = {} as EndpointPayload

describe('endpointBuilder', () => {
  const clientToken = 'some_client_token'
  let initConfiguration: InitConfiguration

  beforeEach(() => {
    initConfiguration = { clientToken }
  })

  describe('query parameters', () => {
    it('should add intake query parameters', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum').build('fetch', DEFAULT_PAYLOAD)).toMatch(
        new RegExp(`&dd-api-key=${clientToken}&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)`)
      )
    })

    it('should add batch_time for rum endpoint', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum').build('fetch', DEFAULT_PAYLOAD)).toContain('&batch_time=')
    })

    it('should not add batch_time for logs and replay endpoints', () => {
      expect(createEndpointBuilder(initConfiguration, 'logs').build('fetch', DEFAULT_PAYLOAD)).not.toContain(
        '&batch_time='
      )
      expect(createEndpointBuilder(initConfiguration, 'replay').build('fetch', DEFAULT_PAYLOAD)).not.toContain(
        '&batch_time='
      )
    })

    it('should add the provided encoding', () => {
      expect(
        createEndpointBuilder(initConfiguration, 'rum').build('fetch', { ...DEFAULT_PAYLOAD, encoding: 'deflate' })
      ).toContain('&dd-evp-encoding=deflate')
    })

    it('accepts extra parameters', () => {
      const extraParameters = ['application.id=1234', 'application.version=1.0.0']
      const url = createEndpointBuilder(initConfiguration, 'rum', extraParameters).build('fetch', DEFAULT_PAYLOAD)
      expect(url).toContain('application.id=1234')
      expect(url).toContain('application.version=1.0.0')
    })
  })

  describe('proxy configuration', () => {
    it('should replace the intake endpoint by the proxy and set the intake path and parameters in the attribute ddforward', () => {
      const url = createEndpointBuilder({ ...initConfiguration, proxy: 'https://proxy.io/path' }, 'rum').build(
        'fetch',
        DEFAULT_PAYLOAD
      )
      expect(url).toContain('https://proxy.io/path?ddforward=')
      expect(url).toContain(encodeURIComponent('/api/v2/rum?ddsource='))
      expect(url).toContain(encodeURIComponent(`&dd-api-key=${clientToken}`))
      expect(url).toContain(encodeURIComponent('&dd-evp-origin=browser'))
    })

    it('normalizes the proxy url', () => {
      const endpoint = createEndpointBuilder({ ...initConfiguration, proxy: '/path' }, 'rum').build(
        'fetch',
        DEFAULT_PAYLOAD
      )
      expect(endpoint.startsWith(`${location.origin}/path?ddforward`)).toBe(true)
    })

    it('should allow to fully control the proxy url', () => {
      const proxyFn = (options: { path: string; parameters: string }) =>
        `https://proxy.io/prefix${options.path}/suffix?${options.parameters}`
      const url = createEndpointBuilder({ ...initConfiguration, proxy: proxyFn }, 'rum').build('fetch', DEFAULT_PAYLOAD)
      expect(url).toContain('https://proxy.io/prefix/api/v2/rum/suffix?ddsource=')
      expect(url).toContain(`&dd-api-key=${clientToken}`)
      expect(url).toContain('&dd-evp-origin=browser')
      expect(url).toContain('&batch_time=')
    })
  })

  describe('_dd attributes', () => {
    it('should contain api', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum').build('fetch', DEFAULT_PAYLOAD)).toContain('_dd.api=fetch')
    })

    it('should contain retry infos', () => {
      expect(
        createEndpointBuilder(initConfiguration, 'rum').build('fetch', {
          ...DEFAULT_PAYLOAD,
          retry: {
            count: 5,
            lastFailureStatus: 408,
          },
        })
      ).toContain('_dd.retry_count=5&_dd.retry_after=408')
    })

    it('should not contain any _dd attributes for non rum endpoints', () => {
      expect(
        createEndpointBuilder(initConfiguration, 'logs').build('fetch', {
          ...DEFAULT_PAYLOAD,
          retry: {
            count: 5,
            lastFailureStatus: 408,
          },
        })
      ).not.toContain('_dd.api=fetch&_dd.retry_count=5&_dd.retry_after=408')
    })
  })

  describe('source configuration', () => {
    it('should use the default source when no configuration is provided', () => {
      const endpoint = createEndpointBuilder(initConfiguration, 'rum').build('fetch', DEFAULT_PAYLOAD)
      expect(endpoint).toContain('ddsource=browser')
    })

    it('should use flutter source when provided', () => {
      const config = { ...initConfiguration, source: 'flutter' as const }
      const endpoint = createEndpointBuilder(config, 'rum').build('fetch', DEFAULT_PAYLOAD)
      expect(endpoint).toContain('ddsource=flutter')
    })

    it('should use unity source when provided', () => {
      const config = { ...initConfiguration, source: 'unity' as const }
      const endpoint = createEndpointBuilder(config, 'rum').build('fetch', DEFAULT_PAYLOAD)
      expect(endpoint).toContain('ddsource=unity')
    })
  })

  describe('createReplicaEndpointBuilder', () => {
    const replica = { clientToken: 'replica_client_token', applicationId: 'replica_application_id' }

    it('returns undefined when no replica is configured', () => {
      const configuration = validateAndBuildConfiguration({ clientToken })!
      expect(createReplicaEndpointBuilder(configuration, 'rum')).toBeUndefined()
    })

    it('uses the replica client token', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, replica })!
      expect(createReplicaEndpointBuilder(configuration, 'rum')!.build('fetch', DEFAULT_PAYLOAD)).toContain(
        `dd-api-key=${replica.clientToken}`
      )
    })

    it('always targets the US1 site, even when the main site differs', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, site: 'datadoghq.eu', replica })!
      expect(createReplicaEndpointBuilder(configuration, 'rum')!.build('fetch', DEFAULT_PAYLOAD)).toContain(
        'https://browser-intake-datadoghq.com'
      )
    })

    it('keeps the proxy of the main configuration', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, proxy: 'https://proxy.io/path', replica })!
      expect(createReplicaEndpointBuilder(configuration, 'rum')!.build('fetch', DEFAULT_PAYLOAD)).toContain(
        'https://proxy.io/path?ddforward'
      )
    })

    it('keeps the source of the main configuration', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, source: 'flutter', replica })!
      expect(createReplicaEndpointBuilder(configuration, 'rum')!.build('fetch', DEFAULT_PAYLOAD)).toContain(
        'ddsource=flutter'
      )
    })

    it('adds the replica application id to the rum endpoint', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, replica })!
      expect(createReplicaEndpointBuilder(configuration, 'rum')!.build('fetch', DEFAULT_PAYLOAD)).toContain(
        `application.id=${replica.applicationId}`
      )
    })

    it('does not add the application id to non-rum endpoints', () => {
      const configuration = validateAndBuildConfiguration({ clientToken, replica })!
      expect(createReplicaEndpointBuilder(configuration, 'logs')!.build('fetch', DEFAULT_PAYLOAD)).not.toContain(
        'application.id'
      )
    })
  })

  describe('buildEndpointUrl', () => {
    it('builds proxy URL from a string proxy', () => {
      expect(
        buildEndpointUrl({
          proxy: 'https://proxy.io/path',
          site: undefined,
          path: '/api/v2/rum',
          parameters: 'foo=bar',
        })
      ).toBe('https://proxy.io/path?ddforward=%2Fapi%2Fv2%2Frum%3Ffoo%3Dbar')
    })

    it('normalizes a relative proxy URL', () => {
      expect(buildEndpointUrl({ proxy: '/path', site: undefined, path: '/api/v2/rum', parameters: 'foo=bar' })).toBe(
        `${location.origin}/path?ddforward=%2Fapi%2Fv2%2Frum%3Ffoo%3Dbar`
      )
    })

    it('adds the subdomain forwarding hint when provided', () => {
      expect(
        buildEndpointUrl({
          proxy: 'https://proxy.io/path',
          site: undefined,
          path: '/api/v2/profiling/quota',
          parameters: 'session_id=abc',
          subdomain: 'quota',
        })
      ).toBe(
        'https://proxy.io/path?ddforward=%2Fapi%2Fv2%2Fprofiling%2Fquota%3Fsession_id%3Dabc&ddforwardSubdomain=quota'
      )
    })

    it('delegates URL creation to proxy function', () => {
      expect(
        buildEndpointUrl({
          proxy: ({ path, parameters, subdomain }) => `https://${subdomain}.proxy.test${path}?${parameters}`,
          site: undefined,
          path: '/api/v2/profiling/quota',
          parameters: 'session_id=abc',
          subdomain: 'quota',
        })
      ).toBe('https://quota.proxy.test/api/v2/profiling/quota?session_id=abc')
    })

    it('falls back to empty parameters when calling proxy function', () => {
      expect(
        buildEndpointUrl({
          proxy: ({ path, parameters }) => `https://proxy.test${path}?${parameters}`,
          site: undefined,
          path: '/api/v2/rum',
        })
      ).toBe('https://proxy.test/api/v2/rum?')
    })

    it('builds intake URL from the site when no proxy is configured', () => {
      expect(
        buildEndpointUrl({
          proxy: undefined,
          site: 'datadoghq.com',
          path: '/api/v2/rum',
          parameters: 'foo=bar',
        })
      ).toBe('https://browser-intake-datadoghq.com/api/v2/rum?foo=bar')
    })

    it('defaults to US1 site when site is undefined', () => {
      expect(
        buildEndpointUrl({
          proxy: undefined,
          site: undefined,
          path: '/api/v2/rum',
          parameters: 'foo=bar',
        })
      ).toBe('https://browser-intake-datadoghq.com/api/v2/rum?foo=bar')
    })

    it('omits the query separator when parameters are empty', () => {
      expect(
        buildEndpointUrl({
          proxy: undefined,
          site: 'datadoghq.com',
          path: '/api/v2/rum',
          parameters: '',
        })
      ).toBe('https://browser-intake-datadoghq.com/api/v2/rum')
    })

    it('adds subdomain to the intake host', () => {
      expect(
        buildEndpointUrl({
          proxy: undefined,
          site: 'datadoghq.com',
          path: '/api/v2/profiling/quota',
          parameters: 'session_id=abc',
          subdomain: 'quota',
        })
      ).toBe('https://quota.browser-intake-datadoghq.com/api/v2/profiling/quota?session_id=abc')
    })
  })
})
