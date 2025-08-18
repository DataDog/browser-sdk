import { DefaultPrivacyLevel, INTAKE_SITE_US1, display } from '@datadog/browser-core'
import { interceptRequests } from '@datadog/browser-core/test'
import type { RumInitConfiguration } from './configuration'
import type { RumRemoteConfiguration } from './remoteConfiguration'
import { applyRemoteConfiguration, buildEndpoint, fetchRemoteConfiguration } from './remoteConfiguration'

const DEFAULT_INIT_CONFIGURATION: RumInitConfiguration = {
  clientToken: 'xxx',
  applicationId: 'xxx',
  service: 'xxx',
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: DefaultPrivacyLevel.MASK,
}

describe('remoteConfiguration', () => {
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
  })

  describe('fetchRemoteConfiguration', () => {
    const configuration = { remoteConfigurationId: 'xxx' } as RumInitConfiguration

    it('should fetch the remote configuration', async () => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              rum: {
                applicationId: 'xxx',
                sessionSampleRate: 50,
                sessionReplaySampleRate: 50,
                defaultPrivacyLevel: 'allow',
              },
            }),
        })
      )

      const fetchResult = await fetchRemoteConfiguration(configuration)
      expect(fetchResult).toEqual({
        ok: true,
        value: {
          applicationId: 'xxx',
          sessionSampleRate: 50,
          sessionReplaySampleRate: 50,
          defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
        },
      })
    })

    it('should return an error if the fetching fails with a server error', async () => {
      interceptor.withFetch(() => Promise.reject(new Error('Server error')))

      const fetchResult = await fetchRemoteConfiguration(configuration)
      expect(fetchResult).toEqual({
        ok: false,
        error: new Error('Error fetching the remote configuration.'),
      })
    })

    it('should throw an error if the fetching fails with a client error', async () => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: false,
        })
      )

      const fetchResult = await fetchRemoteConfiguration(configuration)
      expect(fetchResult).toEqual({
        ok: false,
        error: new Error('Error fetching the remote configuration.'),
      })
    })

    it('should throw an error if the remote config does not contain rum config', async () => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        })
      )

      const fetchResult = await fetchRemoteConfiguration(configuration)
      expect(fetchResult).toEqual({
        ok: false,
        error: new Error('No remote configuration for RUM.'),
      })
    })
  })

  describe('applyRemoteConfiguration', () => {
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
    })

    it('should override the initConfiguration options with the ones from the remote configuration', () => {
      const rumRemoteConfiguration: RumRemoteConfiguration = {
        applicationId: 'yyy',
        sessionSampleRate: 1,
        sessionReplaySampleRate: 1,
        traceSampleRate: 1,
        trackSessionAcrossSubdomains: true,
        allowedTrackingOrigins: [
          { rcSerializedType: 'string', value: 'https://example.com' },
          { rcSerializedType: 'regex', value: '^https:\\/\\/app-\\w+\\.datadoghq\\.com' },
        ],
        allowedTracingUrls: [
          {
            match: { rcSerializedType: 'string', value: 'https://example.com' },
            propagatorTypes: ['b3', 'tracecontext'],
          },
          {
            match: { rcSerializedType: 'regex', value: '^https:\\/\\/app-\\w+\\.datadoghq\\.com' },
            propagatorTypes: ['datadog', 'b3multi'],
          },
        ],
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      }
      expect(applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, rumRemoteConfiguration)).toEqual({
        applicationId: 'yyy',
        clientToken: 'xxx',
        service: 'xxx',
        sessionSampleRate: 1,
        sessionReplaySampleRate: 1,
        traceSampleRate: 1,
        trackSessionAcrossSubdomains: true,
        allowedTrackingOrigins: ['https://example.com', /^https:\/\/app-\w+\.datadoghq\.com/],
        allowedTracingUrls: [
          { match: 'https://example.com', propagatorTypes: ['b3', 'tracecontext'] },
          { match: /^https:\/\/app-\w+\.datadoghq\.com/, propagatorTypes: ['datadog', 'b3multi'] },
        ],
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      })
    })

    it('should display an error if the remote config contains invalid regex', () => {
      const rumRemoteConfiguration: RumRemoteConfiguration = {
        applicationId: 'yyy',
        allowedTrackingOrigins: [{ rcSerializedType: 'regex', value: 'Hello(?|!)' }],
      }
      expect(applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, rumRemoteConfiguration)).toEqual({
        ...DEFAULT_INIT_CONFIGURATION,
        applicationId: 'yyy',
        allowedTrackingOrigins: [undefined as any],
      })
      expect(displaySpy).toHaveBeenCalledWith("Invalid regex in the remote configuration: 'Hello(?|!)'")
    })

    it('should display an error if an unsupported `rcSerializedType` is provided', () => {
      const rumRemoteConfiguration: RumRemoteConfiguration = {
        applicationId: 'yyy',
        allowedTrackingOrigins: [{ rcSerializedType: 'foo' as any, value: 'bar' }],
      }
      expect(applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, rumRemoteConfiguration)).toEqual({
        ...DEFAULT_INIT_CONFIGURATION,
        applicationId: 'yyy',
        allowedTrackingOrigins: [undefined as any],
      })
      expect(displaySpy).toHaveBeenCalledWith('Unsupported remote configuration: "rcSerializedType": "foo"')
    })
  })

  describe('buildEndpoint', () => {
    it('should return the remote configuration endpoint', () => {
      const remoteConfigurationId = '0e008b1b-8600-4709-9d1d-f4edcfdf5587'
      expect(buildEndpoint({ site: INTAKE_SITE_US1, remoteConfigurationId } as RumInitConfiguration)).toEqual(
        `https://sdk-configuration.browser-intake-datadoghq.com/v1/${remoteConfigurationId}.json`
      )
    })

    it('should return the remote configuration proxy', () => {
      expect(buildEndpoint({ remoteConfigurationProxy: '/config' } as RumInitConfiguration)).toEqual('/config')
    })
  })
})
