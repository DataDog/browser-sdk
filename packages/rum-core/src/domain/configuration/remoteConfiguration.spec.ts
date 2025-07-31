import {
  DefaultPrivacyLevel,
  INTAKE_SITE_US1,
  display,
  setCookie,
  deleteCookie,
  ONE_MINUTE,
  createContextManager,
} from '@datadog/browser-core'
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
  describe('fetchRemoteConfiguration', () => {
    const configuration = { remoteConfigurationId: 'xxx' } as RumInitConfiguration
    let interceptor: ReturnType<typeof interceptRequests>

    beforeEach(() => {
      interceptor = interceptRequests()
    })

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
    let supportedContextManagers: {
      user: ReturnType<typeof createContextManager>
      context: ReturnType<typeof createContextManager>
    }

    function expectAppliedRemoteConfigurationToBe(
      actual: Partial<RumRemoteConfiguration>,
      expected: Partial<RumInitConfiguration>
    ) {
      const rumRemoteConfiguration: RumRemoteConfiguration = {
        applicationId: 'yyy',
        ...actual,
      }
      expect(
        applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, rumRemoteConfiguration, supportedContextManagers)
      ).toEqual({
        ...DEFAULT_INIT_CONFIGURATION,
        applicationId: 'yyy',
        ...expected,
      })
    }

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      supportedContextManagers = { user: createContextManager(), context: createContextManager() }
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
      expect(
        applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, rumRemoteConfiguration, supportedContextManagers)
      ).toEqual({
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
      expectAppliedRemoteConfigurationToBe(
        { allowedTrackingOrigins: [{ rcSerializedType: 'regex', value: 'Hello(?|!)' }] },
        { allowedTrackingOrigins: [undefined as any] }
      )
      expect(displaySpy).toHaveBeenCalledWith("Invalid regex in the remote configuration: 'Hello(?|!)'")
    })

    it('should display an error if an unsupported `rcSerializedType` is provided', () => {
      expectAppliedRemoteConfigurationToBe(
        { allowedTrackingOrigins: [{ rcSerializedType: 'foo' as any, value: 'bar' }] },
        { allowedTrackingOrigins: [undefined as any] }
      )
      expect(displaySpy).toHaveBeenCalledWith('Unsupported remote configuration: "rcSerializedType": "foo"')
    })

    it('should display an error if an unsupported `strategy` is provided', () => {
      expectAppliedRemoteConfigurationToBe(
        { version: { rcSerializedType: 'dynamic', strategy: 'foo' as any } as any },
        { version: undefined }
      )
      expect(displaySpy).toHaveBeenCalledWith('Unsupported remote configuration: "strategy": "foo"')
    })

    describe('cookie strategy', () => {
      const COOKIE_NAME = 'unit_rc'

      beforeEach(() => {
        setCookie(COOKIE_NAME, 'my-version', ONE_MINUTE)
      })

      afterEach(() => {
        deleteCookie(COOKIE_NAME)
      })

      it('should resolve a configuration value from a cookie', () => {
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: COOKIE_NAME } },
          { version: 'my-version' }
        )
      })

      it('should resolve to undefined if the cookie is missing', () => {
        deleteCookie(COOKIE_NAME)
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: COOKIE_NAME } },
          { version: undefined }
        )
      })
    })

    describe('with extractor', () => {
      const COOKIE_NAME = 'unit_rc'

      beforeEach(() => {
        setCookie(COOKIE_NAME, 'my-version-123', ONE_MINUTE)
      })

      afterEach(() => {
        deleteCookie(COOKIE_NAME)
      })

      it('should resolve to the match on the value', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            version: {
              rcSerializedType: 'dynamic',
              strategy: 'cookie',
              name: COOKIE_NAME,
              extractor: { rcSerializedType: 'regex', value: '\\d+' },
            },
          },
          { version: '123' }
        )
      })

      it('should resolve to the capture group on the value', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            version: {
              rcSerializedType: 'dynamic',
              strategy: 'cookie',
              name: COOKIE_NAME,
              extractor: { rcSerializedType: 'regex', value: 'my-version-(\\d+)' },
            },
          },
          { version: '123' }
        )
      })

      it("should resolve to undefined if the value don't match", () => {
        expectAppliedRemoteConfigurationToBe(
          {
            version: {
              rcSerializedType: 'dynamic',
              strategy: 'cookie',
              name: COOKIE_NAME,
              extractor: { rcSerializedType: 'regex', value: 'foo' },
            },
          },
          { version: undefined }
        )
      })

      it('should display an error if the extractor is not a valid regex', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            version: {
              rcSerializedType: 'dynamic',
              strategy: 'cookie',
              name: COOKIE_NAME,
              extractor: { rcSerializedType: 'regex', value: 'Hello(?|!)' },
            },
          },
          { version: undefined }
        )
        expect(displaySpy).toHaveBeenCalledWith("Invalid regex in the remote configuration: 'Hello(?|!)'")
      })
    })

    describe('supported contexts', () => {
      const COOKIE_NAME = 'unit_rc'

      beforeEach(() => {
        setCookie(COOKIE_NAME, 'first.second', ONE_MINUTE)
      })

      afterEach(() => {
        deleteCookie(COOKIE_NAME)
      })

      it('should be resolved from the provided configuration', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            user: {
              id: {
                rcSerializedType: 'dynamic',
                strategy: 'cookie',
                name: COOKIE_NAME,
                extractor: { rcSerializedType: 'regex', value: '(\\w+)\\.\\w+' },
              },
              additionals: [
                {
                  key: 'bar',
                  value: {
                    rcSerializedType: 'dynamic',
                    strategy: 'cookie',
                    name: COOKIE_NAME,
                    extractor: { rcSerializedType: 'regex', value: '\\w+\\.(\\w+)' },
                  },
                },
              ],
            },
          },
          {}
        )
        expect(supportedContextManagers.user.getContext()).toEqual({
          id: 'first',
          bar: 'second',
        })
      })

      it('unresolved property should be set to undefined', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            context: {
              additionals: [
                {
                  key: 'foo',
                  value: {
                    rcSerializedType: 'dynamic',
                    strategy: 'cookie',
                    name: 'missing-cookie',
                  },
                },
              ],
            },
          },
          {}
        )
        expect(supportedContextManagers.context.getContext()).toEqual({
          foo: undefined,
        })
      })
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
