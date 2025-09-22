import {
  DefaultPrivacyLevel,
  INTAKE_SITE_US1,
  display,
  setCookie,
  deleteCookie,
  ONE_MINUTE,
  createContextManager,
} from '@datadog/browser-core'
import { interceptRequests, registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement } from '../../../test'
import type { RumInitConfiguration } from './configuration'
import {
  type RumRemoteConfiguration,
  initMetrics,
  applyRemoteConfiguration,
  buildEndpoint,
  fetchRemoteConfiguration,
} from './remoteConfiguration'

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
    const COOKIE_NAME = 'unit_rc'
    const root = window as any

    let displaySpy: jasmine.Spy
    let supportedContextManagers: {
      user: ReturnType<typeof createContextManager>
      context: ReturnType<typeof createContextManager>
    }
    let metrics: ReturnType<typeof initMetrics>

    function expectAppliedRemoteConfigurationToBe(
      actual: Partial<RumRemoteConfiguration>,
      expected: Partial<RumInitConfiguration>
    ) {
      const rumRemoteConfiguration: RumRemoteConfiguration = {
        applicationId: 'yyy',
        ...actual,
      }
      expect(
        applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, rumRemoteConfiguration, supportedContextManagers, metrics)
      ).toEqual({
        ...DEFAULT_INIT_CONFIGURATION,
        applicationId: 'yyy',
        ...expected,
      })
    }

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
      supportedContextManagers = { user: createContextManager(), context: createContextManager() }
      metrics = initMetrics()
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
        applyRemoteConfiguration(DEFAULT_INIT_CONFIGURATION, rumRemoteConfiguration, supportedContextManagers, metrics)
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
      it('should resolve a configuration value from a cookie', () => {
        setCookie(COOKIE_NAME, 'my-version', ONE_MINUTE)
        registerCleanupTask(() => deleteCookie(COOKIE_NAME))
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: COOKIE_NAME } },
          { version: 'my-version' }
        )
        expect(metrics.get().cookie).toEqual({ success: 1 })
      })

      it('should resolve to undefined if the cookie is missing', () => {
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: COOKIE_NAME } },
          { version: undefined }
        )
        expect(metrics.get().cookie).toEqual({ missing: 1 })
      })
    })

    describe('dom strategy', () => {
      beforeEach(() => {
        appendElement(`<div>
            <span id="version1" class="version">version-123</span>
            <span id="version2" class="version" data-version="version-456"></span>
          </div>`)
      })

      it('should resolve a configuration value from an element text content', () => {
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#version1' } },
          { version: 'version-123' }
        )
        expect(metrics.get().dom).toEqual({ success: 1 })
      })

      it('should resolve a configuration value from an element text content and an extractor', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            version: {
              rcSerializedType: 'dynamic',
              strategy: 'dom',
              selector: '#version1',
              extractor: { rcSerializedType: 'regex', value: '\\d+' },
            },
          },
          { version: '123' }
        )
      })

      it('should resolve a configuration value from the first element matching the selector', () => {
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '.version' } },
          { version: 'version-123' }
        )
      })

      it('should resolve to undefined and display an error if the selector is invalid', () => {
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '' } },
          { version: undefined }
        )
        expect(displaySpy).toHaveBeenCalledWith("Invalid selector in the remote configuration: ''")
        expect(metrics.get().dom).toEqual({ failure: 1 })
      })

      it('should resolve to undefined if the element is missing', () => {
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#missing' } },
          { version: undefined }
        )
        expect(metrics.get().dom).toEqual({ missing: 1 })
      })

      it('should resolve a configuration value from an element attribute', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#version2', attribute: 'data-version' },
          },
          { version: 'version-456' }
        )
      })

      it('should resolve to undefined if the element attribute is missing', () => {
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#version2', attribute: 'missing' } },
          { version: undefined }
        )
        expect(metrics.get().dom).toEqual({ missing: 1 })
      })

      it('should resolve to undefined if trying to access a password input value attribute', () => {
        appendElement('<input id="pwd" type="password" value="foo" />')
        expectAppliedRemoteConfigurationToBe(
          { version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#pwd', attribute: 'value' } },
          { version: undefined }
        )
        expect(displaySpy).toHaveBeenCalledWith("Forbidden element selected by the remote configuration: '#pwd'")
      })
    })

    describe('js strategy', () => {
      it('should resolve a value from a variable content', () => {
        root.foo = 'bar'
        registerCleanupTask(() => {
          delete root.foo
        })
        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'foo' },
          },
          { version: 'bar' }
        )
        expect(metrics.get().js).toEqual({ success: 1 })
      })

      it('should resolve a value from an object property', () => {
        root.foo = { bar: { qux: '123' } }
        registerCleanupTask(() => {
          delete root.foo
        })
        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'foo.bar.qux' },
          },
          { version: '123' }
        )
      })

      it('should resolve a string value with an extractor', () => {
        root.foo = 'version-123'
        registerCleanupTask(() => {
          delete root.foo
        })
        expectAppliedRemoteConfigurationToBe(
          {
            version: {
              rcSerializedType: 'dynamic',
              strategy: 'js',
              path: 'foo',
              extractor: { rcSerializedType: 'regex', value: '\\d+' },
            },
          },
          { version: '123' }
        )
      })

      it('should resolve to a non string value', () => {
        root.foo = 23
        registerCleanupTask(() => {
          delete root.foo
        })
        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'foo' },
          },
          { version: 23 as any }
        )
      })

      it('should resolve a value from an object property containing an escapable character', () => {
        root.foo = { 'bar\nqux': '123' }
        registerCleanupTask(() => {
          delete root.foo
        })
        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: "foo['bar\\nqux']" },
          },
          { version: '123' }
        )
      })

      it('should not apply the extractor to a non string value', () => {
        root.foo = 23
        registerCleanupTask(() => {
          delete root.foo
        })
        expectAppliedRemoteConfigurationToBe(
          {
            version: {
              rcSerializedType: 'dynamic',
              strategy: 'js',
              path: 'foo',
              extractor: { rcSerializedType: 'regex', value: '\\d+' },
            },
          },
          { version: 23 as any }
        )
      })

      it('should resolve a value from an array item', () => {
        root.foo = { bar: [{ qux: '123' }] }
        registerCleanupTask(() => {
          delete root.foo
        })
        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'foo.bar[0].qux' },
          },
          { version: '123' }
        )
      })

      it('should resolve to undefined and display an error if the JSON path is invalid', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: '.' },
          },
          { version: undefined }
        )
        expect(displaySpy).toHaveBeenCalledWith("Invalid JSON path in the remote configuration: '.'")
        expect(metrics.get().js).toEqual({ failure: 1 })
      })

      it('should resolve to undefined and display an error if the variable access throws', () => {
        root.foo = {
          get bar() {
            throw new Error('foo')
          },
        }
        registerCleanupTask(() => {
          delete root.foo
        })
        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'foo.bar' },
          },
          { version: undefined }
        )
        expect(displaySpy).toHaveBeenCalledWith("Error accessing: 'foo.bar'", new Error('foo'))
        expect(metrics.get().js).toEqual({ failure: 1 })
      })

      it('should resolve to undefined if the variable does not exist', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'missing' },
          },
          { version: undefined }
        )
        expect(metrics.get().js).toEqual({ missing: 1 })
      })

      it('should resolve to undefined if the property does not exist', () => {
        root.foo = {}
        registerCleanupTask(() => {
          delete root.foo
        })

        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'foo.missing' },
          },
          { version: undefined }
        )
        expect(metrics.get().js).toEqual({ missing: 1 })
      })

      it('should resolve to undefined if the array index does not exist', () => {
        root.foo = []
        registerCleanupTask(() => {
          delete root.foo
        })

        expectAppliedRemoteConfigurationToBe(
          {
            version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'foo[0]' },
          },
          { version: undefined }
        )
        expect(metrics.get().js).toEqual({ missing: 1 })
      })
    })

    describe('with extractor', () => {
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
      beforeEach(() => {
        setCookie(COOKIE_NAME, 'first.second', ONE_MINUTE)
      })

      afterEach(() => {
        deleteCookie(COOKIE_NAME)
      })

      it('should be resolved from the provided configuration', () => {
        expectAppliedRemoteConfigurationToBe(
          {
            user: [
              {
                key: 'id',
                value: {
                  rcSerializedType: 'dynamic',
                  strategy: 'cookie',
                  name: COOKIE_NAME,
                  extractor: { rcSerializedType: 'regex', value: '(\\w+)\\.\\w+' },
                },
              },
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
            context: [
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
          {}
        )
        expect(supportedContextManagers.context.getContext()).toEqual({
          foo: undefined,
        })
      })
    })

    describe('metrics', () => {
      it('should report resolution stats', () => {
        setCookie(COOKIE_NAME, 'my-version', ONE_MINUTE)
        root.foo = '123'
        registerCleanupTask(() => {
          deleteCookie(COOKIE_NAME)
          delete root.foo
        })

        expectAppliedRemoteConfigurationToBe(
          {
            context: [
              {
                key: 'missing-cookie',
                value: {
                  rcSerializedType: 'dynamic',
                  strategy: 'cookie',
                  name: 'missing-cookie',
                },
              },
              {
                key: 'existing-cookie',
                value: {
                  rcSerializedType: 'dynamic',
                  strategy: 'cookie',
                  name: COOKIE_NAME,
                },
              },
              {
                key: 'existing-cookie2',
                value: {
                  rcSerializedType: 'dynamic',
                  strategy: 'cookie',
                  name: COOKIE_NAME,
                },
              },
              {
                key: 'existing-js',
                value: {
                  rcSerializedType: 'dynamic',
                  strategy: 'js',
                  path: 'foo',
                },
              },
            ],
          },
          {}
        )
        expect(metrics.get()).toEqual(
          jasmine.objectContaining({
            cookie: { success: 2, missing: 1 },
            js: { success: 1 },
          })
        )
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
