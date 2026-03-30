import type { Payload } from '../../transport'
import type { InitConfiguration } from './configuration'
import { createEndpointBuilder } from './endpointBuilder'

const DEFAULT_PAYLOAD = {} as Payload

describe('endpointBuilder', () => {
  const clientToken = 'some_client_token'
  let initConfiguration: InitConfiguration

  beforeEach(() => {
    initConfiguration = { clientToken }
  })

  describe('query parameters', () => {
    it('should add intake query parameters', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum').build('fetch', DEFAULT_PAYLOAD)).toMatch(
        `&dd-api-key=${clientToken}&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)`
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
      expect(
        createEndpointBuilder({ ...initConfiguration, proxy: 'https://proxy.io/path' }, 'rum').build(
          'fetch',
          DEFAULT_PAYLOAD
        )
      ).toMatch(
        `https://proxy.io/path\\?ddforward=${encodeURIComponent(
          `/api/v2/rum?ddsource=(.*)&dd-api-key=${clientToken}` +
            '&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)&batch_time=(.*)'
        )}`
      )
    })

    it('normalizes the proxy url', () => {
      const endpoint = createEndpointBuilder({ ...initConfiguration, proxy: '/path' }, 'rum').build(
        'fetch',
        DEFAULT_PAYLOAD
      )
      expect(endpoint.startsWith(`${location.origin}/path?ddforward`)).toBeTrue()
    })

    it('should allow to fully control the proxy url', () => {
      const proxyFn = (options: { path: string; parameters: string }) =>
        `https://proxy.io/prefix${options.path}/suffix?${options.parameters}`
      expect(
        createEndpointBuilder({ ...initConfiguration, proxy: proxyFn }, 'rum').build('fetch', DEFAULT_PAYLOAD)
      ).toMatch(
        `https://proxy.io/prefix/api/v2/rum/suffix\\?ddsource=(.*)&dd-api-key=${clientToken}&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)&batch_time=(.*)`
      )
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
})
