import type { BuildEnvWindow } from '../../../test'
import {
  ExperimentalFeature,
  resetExperimentalFeatures,
  addExperimentalFeatures,
} from '../../tools/experimentalFeatures'
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
    resetExperimentalFeatures()
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

    it('should contain flush reason when ff collect_flush_reason is enabled', () => {
      addExperimentalFeatures([ExperimentalFeature.COLLECT_FLUSH_REASON])
      expect(
        createEndpointBuilder(initConfiguration, 'rum', []).build('xhr', {
          ...DEFAULT_PAYLOAD,
          flushReason: 'bytes_limit',
        })
      ).toContain('flush_reason%3Abytes_limit')
    })

    it('should not contain flush reason when ff collect_flush_reason is disabled', () => {
      expect(
        createEndpointBuilder(initConfiguration, 'rum', []).build('xhr', {
          ...DEFAULT_PAYLOAD,
          flushReason: 'bytes_limit',
        })
      ).not.toContain('flush_reason')
    })
  })
})
