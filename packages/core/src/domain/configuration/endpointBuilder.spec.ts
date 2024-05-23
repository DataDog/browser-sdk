import type { BuildEnvWindow } from '../../../test'
import { startsWith } from '../../tools/utils/polyfills'
import type { Payload } from '../../transport'
import type { InitConfiguration } from './configuration'
import { createEndpointBuilder } from './endpointBuilder'

const DEFAULT_PAYLOAD = {} as Payload

describe('endpointBuilder', () => {
  const clientToken = 'some_client_token'
  let initConfiguration: InitConfiguration

  beforeEach(() => {
    initConfiguration = { clientToken }
    ;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'some_version'
  })

  describe('query parameters', () => {
    it('should add intake query parameters', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum', []).build('xhr', DEFAULT_PAYLOAD)).toMatch(
        `&dd-api-key=${clientToken}&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)`
      )
    })

    it('should add batch_time for rum endpoint', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum', []).build('xhr', DEFAULT_PAYLOAD)).toContain(
        '&batch_time='
      )
    })

    it('should not add batch_time for logs and replay endpoints', () => {
      expect(createEndpointBuilder(initConfiguration, 'logs', []).build('xhr', DEFAULT_PAYLOAD)).not.toContain(
        '&batch_time='
      )
      expect(createEndpointBuilder(initConfiguration, 'replay', []).build('xhr', DEFAULT_PAYLOAD)).not.toContain(
        '&batch_time='
      )
    })

    it('should add the provided encoding', () => {
      expect(
        createEndpointBuilder(initConfiguration, 'rum', []).build('xhr', { ...DEFAULT_PAYLOAD, encoding: 'deflate' })
      ).toContain('&dd-evp-encoding=deflate')
    })

    it('should not start with ddsource for internal analytics mode', () => {
      const url = createEndpointBuilder({ ...initConfiguration, internalAnalyticsSubdomain: 'foo' }, 'rum', []).build(
        'xhr',
        DEFAULT_PAYLOAD
      )
      expect(url).not.toContain('/rum?ddsource')
      expect(url).toContain('ddsource=browser')
    })
  })

  describe('proxy configuration', () => {
    it('should replace the intake endpoint by the proxy and set the intake path and parameters in the attribute ddforward', () => {
      expect(
        createEndpointBuilder({ ...initConfiguration, proxy: 'https://proxy.io/path' }, 'rum', []).build(
          'xhr',
          DEFAULT_PAYLOAD
        )
      ).toMatch(
        `https://proxy.io/path\\?ddforward=${encodeURIComponent(
          `/api/v2/rum?ddsource=(.*)&ddtags=(.*)&dd-api-key=${clientToken}` +
            '&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)&batch_time=(.*)'
        )}`
      )
    })

    it('normalizes the proxy url', () => {
      expect(
        startsWith(
          createEndpointBuilder({ ...initConfiguration, proxy: '/path' }, 'rum', []).build('xhr', DEFAULT_PAYLOAD),
          `${location.origin}/path?ddforward`
        )
      ).toBeTrue()
    })

    it('should allow to fully control the proxy url', () => {
      const proxyFn = (options: { path: string; parameters: string }) =>
        `https://proxy.io/prefix${options.path}/suffix?${options.parameters}`
      expect(
        createEndpointBuilder({ ...initConfiguration, proxy: proxyFn }, 'rum', []).build('xhr', DEFAULT_PAYLOAD)
      ).toMatch(
        `https://proxy.io/prefix/api/v2/rum/suffix\\?ddsource=(.*)&ddtags=(.*)&dd-api-key=${clientToken}&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)&batch_time=(.*)`
      )
    })
  })

  describe('tags', () => {
    it('should contain sdk version', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum', []).build('xhr', DEFAULT_PAYLOAD)).toContain(
        'sdk_version%3Asome_version'
      )
    })

    it('should contain api', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum', []).build('xhr', DEFAULT_PAYLOAD)).toContain('api%3Axhr')
    })

    it('should be encoded', () => {
      expect(
        createEndpointBuilder(initConfiguration, 'rum', ['service:bar:foo', 'datacenter:us1.prod.dog']).build(
          'xhr',
          DEFAULT_PAYLOAD
        )
      ).toContain('service%3Abar%3Afoo%2Cdatacenter%3Aus1.prod.dog')
    })

    it('should contain retry infos', () => {
      expect(
        createEndpointBuilder(initConfiguration, 'rum', []).build('xhr', {
          ...DEFAULT_PAYLOAD,
          retry: {
            count: 5,
            lastFailureStatus: 408,
          },
        })
      ).toContain('retry_count%3A5%2Cretry_after%3A408')
    })
  })

  describe('PCI compliance intake with option', () => {
    beforeEach(() => {
      ;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'some_version'
    })

    it('should return PCI compliance intake endpoint if site is us1', () => {
      const config: InitConfiguration & { usePciIntake?: boolean } = {
        clientToken,
        site: 'datadoghq.com',
        usePciIntake: true,
      }
      expect(createEndpointBuilder(config, 'logs', []).build('xhr', DEFAULT_PAYLOAD)).toContain(
        'https://pci.browser-intake-datadoghq.com'
      )
    })
    it('should not return PCI compliance intake endpoint if site is not us1', () => {
      const config: InitConfiguration & { usePciIntake?: boolean } = {
        clientToken,
        site: 'ap1.datadoghq.com',
        usePciIntake: true,
      }
      expect(createEndpointBuilder(config, 'logs', []).build('xhr', DEFAULT_PAYLOAD)).not.toContain(
        'https://pci.browser-intake-datadoghq.com'
      )
    })
    it('should not return PCI compliance intake endpoint if and site is us1 and track is not logs', () => {
      const config: InitConfiguration & { usePciIntake?: boolean } = {
        clientToken,
        site: 'datadoghq.com',
        usePciIntake: true,
      }
      expect(createEndpointBuilder(config, 'rum', []).build('xhr', DEFAULT_PAYLOAD)).not.toContain(
        'https://pci.browser-intake-datadoghq.com'
      )
    })
  })
})
