import type { BuildEnvWindow } from '../../../test/specHelper'
import type { InitConfiguration } from './configuration'
import { createEndpointBuilder } from './endpointBuilder'

describe('endpointBuilder', () => {
  const clientToken = 'some_client_token'
  let initConfiguration: InitConfiguration

  beforeEach(() => {
    initConfiguration = { clientToken }
    ;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'some_version'
  })

  describe('query parameters', () => {
    it('should add intake query parameters', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum', []).build('xhr')).toMatch(
        `&dd-api-key=${clientToken}&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)`
      )
    })

    it('should add batch_time for rum endpoint', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum', []).build('xhr')).toContain('&batch_time=')
    })

    it('should not add batch_time for logs and replay endpoints', () => {
      expect(createEndpointBuilder(initConfiguration, 'logs', []).build('xhr')).not.toContain('&batch_time=')
      expect(createEndpointBuilder(initConfiguration, 'sessionReplay', []).build('xhr')).not.toContain('&batch_time=')
    })
  })

  describe('proxyUrl', () => {
    it('should replace the full intake endpoint by the proxyUrl and set it in the attribute ddforward', () => {
      expect(
        createEndpointBuilder({ ...initConfiguration, proxyUrl: 'https://proxy.io/path' }, 'rum', []).build('xhr')
      ).toMatch(
        `https://proxy.io/path\\?ddforward=${encodeURIComponent(
          `https://rum.browser-intake-datadoghq.com/api/v2/rum?ddsource=(.*)&ddtags=(.*)&dd-api-key=${clientToken}` +
            '&dd-evp-origin-version=(.*)&dd-evp-origin=browser&dd-request-id=(.*)&batch_time=(.*)'
        )}`
      )
    })
  })

  describe('tags', () => {
    it('should contain sdk version', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum', []).build('xhr')).toContain('sdk_version%3Asome_version')
    })

    it('should contain api', () => {
      expect(createEndpointBuilder(initConfiguration, 'rum', []).build('xhr')).toContain('api%3Axhr')
    })

    it('should be encoded', () => {
      expect(
        createEndpointBuilder(initConfiguration, 'rum', ['service:bar:foo', 'datacenter:us1.prod.dog']).build('xhr')
      ).toContain('service%3Abar%3Afoo%2Cdatacenter%3Aus1.prod.dog')
    })

    it('should contain retry infos', () => {
      expect(
        createEndpointBuilder(initConfiguration, 'rum', []).build('xhr', { count: 5, lastFailureStatus: 408 })
      ).toContain('retry_count%3A5%2Cretry_after%3A408')
    })
  })
})
