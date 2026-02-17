import { display, setCookie, deleteCookie, ONE_MINUTE } from '@datadog/browser-core'
import { interceptRequests, registerCleanupTask } from '@datadog/browser-core/test'
import { fetchRemoteConfiguration, buildEndpoint, resolveDynamicValues } from './remoteConfiguration'
import { parseJsonPath } from './jsonPathParser'

describe('remoteConfiguration', () => {
  describe('buildEndpoint', () => {
    it('should build the default endpoint', () => {
      const endpoint = buildEndpoint({
        applicationId: 'my-app',
        remoteConfigurationId: '0e008b1b-8600-4709-9d1d-f4edcfdf5587',
      })
      expect(endpoint).toMatch(/^https:\/\/sdk-configuration\.browser-intake-datadoghq\.com\/v1\/[^/]+\.json$/)
    })

    it('should build endpoint with custom site', () => {
      const endpoint = buildEndpoint({
        applicationId: 'my-app',
        remoteConfigurationId: '0e008b1b-8600-4709-9d1d-f4edcfdf5587',
        site: 'datadoghq.eu',
      })
      expect(endpoint).toMatch(/^https:\/\/sdk-configuration\.browser-intake-datadoghq\.eu\/v1\/[^/]+\.json$/)
    })

    it('should use custom proxy when provided', () => {
      const customProxy = 'https://custom.proxy.com/config'
      const endpoint = buildEndpoint({
        applicationId: 'my-app',
        remoteConfigurationId: '0e008b1b-8600-4709-9d1d-f4edcfdf5587',
        remoteConfigurationProxy: customProxy,
      })
      expect(endpoint).toBe(customProxy)
    })

    it('should encode the remote configuration ID', () => {
      const endpoint = buildEndpoint({
        applicationId: 'my-app',
        remoteConfigurationId: 'id/with/slashes',
      })
      expect(endpoint).toContain(encodeURIComponent('id/with/slashes'))
    })
  })

  describe('fetchRemoteConfiguration', () => {
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
                applicationId: 'my-app',
                sessionSampleRate: 50,
                sessionReplaySampleRate: 75,
                env: 'production',
              },
            }),
        })
      )

      const result = await fetchRemoteConfiguration({
        applicationId: 'my-app',
        remoteConfigurationId: 'config-id',
      })

      expect(result.ok).toBe(true)
      expect(result.value).toEqual({
        applicationId: 'my-app',
        sessionSampleRate: 50,
        sessionReplaySampleRate: 75,
        env: 'production',
      })
      expect(result.error).toBeUndefined()
    })

    it('should return error on network failure', async () => {
      interceptor.withFetch(() => Promise.reject(new Error('Network error')))

      const result = await fetchRemoteConfiguration({
        applicationId: 'my-app',
        remoteConfigurationId: 'config-id',
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Error fetching the remote configuration.')
      expect(result.value).toBeUndefined()
    })

    it('should return error on HTTP error response', async () => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: false,
          status: 404,
        })
      )

      const result = await fetchRemoteConfiguration({
        applicationId: 'my-app',
        remoteConfigurationId: 'config-id',
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.value).toBeUndefined()
    })

    it('should return error if response has no rum config', async () => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        })
      )

      const result = await fetchRemoteConfiguration({
        applicationId: 'my-app',
        remoteConfigurationId: 'config-id',
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toBe('No remote configuration for RUM.')
      expect(result.value).toBeUndefined()
    })

    it('should parse JSON response correctly', async () => {
      interceptor.withFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              rum: {
                applicationId: 'app123',
                service: 'my-service',
                env: 'staging',
                version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'app_version' },
                sessionSampleRate: 100,
                traceSampleRate: 50,
              },
            }),
        })
      )

      const result = await fetchRemoteConfiguration({
        applicationId: 'app123',
        remoteConfigurationId: 'config-id',
      })

      expect(result.ok).toBe(true)
      expect(result.value?.service).toBe('my-service')
      expect(result.value?.traceSampleRate).toBe(50)
    })
  })

  describe('resolveDynamicValues', () => {
    describe('static values', () => {
      it('should return static string values as-is', () => {
        const value = resolveDynamicValues('static-value')
        expect(value).toBe('static-value')
      })

      it('should return numbers as-is', () => {
        const value = resolveDynamicValues(42)
        expect(value).toBe(42)
      })

      it('should return booleans as-is', () => {
        const value = resolveDynamicValues(true)
        expect(value).toBe(true)
      })

      it('should resolve arrays recursively', () => {
        const value = resolveDynamicValues([
          { rcSerializedType: 'string', value: 'a' },
          { rcSerializedType: 'string', value: 'b' },
        ])
        expect(value).toEqual(['a', 'b'])
      })
    })

    describe('serialized strings', () => {
      it('should unwrap serialized string values', () => {
        const value = resolveDynamicValues({
          rcSerializedType: 'string',
          value: 'my-value',
        })
        expect(value).toBe('my-value')
      })
    })

    describe('regex values', () => {
      it('should create RegExp from regex serialization', () => {
        const value = resolveDynamicValues({
          rcSerializedType: 'regex',
          value: '^test-.*',
        })
        expect(value).toEqual(/^test-.*/)
      })

      it('should handle invalid regex gracefully', () => {
        const displaySpy = spyOn(display, 'error')
        const value = resolveDynamicValues({
          rcSerializedType: 'regex',
          value: 'invalid(?|regex)',
        })
        expect(value).toBeUndefined()
        expect(displaySpy).toHaveBeenCalledWith("Invalid regex in the remote configuration: 'invalid(?|regex)'")
      })
    })

    describe('dynamic cookie values', () => {
      const COOKIE_NAME = 'test-cookie'

      beforeEach(() => {
        setCookie(COOKIE_NAME, 'cookie-value', ONE_MINUTE)
        registerCleanupTask(() => deleteCookie(COOKIE_NAME))
      })

      it('should resolve cookie values', () => {
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'cookie',
          name: COOKIE_NAME,
        })
        expect(value).toBe('cookie-value')
      })

      it('should call callback when resolving cookie', () => {
        const onCookie = jasmine.createSpy()
        resolveDynamicValues(
          {
            rcSerializedType: 'dynamic',
            strategy: 'cookie',
            name: COOKIE_NAME,
          },
          { onCookie }
        )
        expect(onCookie).toHaveBeenCalledWith('cookie-value')
      })

      it('should resolve to undefined if cookie missing', () => {
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'cookie',
          name: 'nonexistent',
        })
        expect(value).toBeUndefined()
      })

      it('should apply regex extractor to cookie value', () => {
        setCookie(COOKIE_NAME, 'v1.2.3', ONE_MINUTE)
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'cookie',
          name: COOKIE_NAME,
          extractor: {
            rcSerializedType: 'regex',
            value: 'v(\\d+)',
          },
        })
        expect(value).toBe('1')
      })
    })

    describe('dynamic DOM values', () => {
      it('should resolve DOM text content', () => {
        const element = document.createElement('div')
        element.textContent = 'content-value'
        element.id = 'test-element'
        document.body.appendChild(element)
        registerCleanupTask(() => element.remove())

        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'dom',
          selector: '#test-element',
        })
        expect(value).toBe('content-value')
      })

      it('should resolve DOM attribute values', () => {
        const element = document.createElement('div')
        element.setAttribute('data-version', 'attr-value')
        element.id = 'test-attr-element'
        document.body.appendChild(element)
        registerCleanupTask(() => element.remove())

        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'dom',
          selector: '#test-attr-element',
          attribute: 'data-version',
        })
        expect(value).toBe('attr-value')
      })

      it('should return undefined if element not found', () => {
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'dom',
          selector: '#nonexistent-element',
        })
        expect(value).toBeUndefined()
      })

      it('should report error for invalid selectors', () => {
        const displaySpy = spyOn(display, 'error')
        resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'dom',
          selector: ':invalid(selector)',
        })
        expect(displaySpy).toHaveBeenCalled()
      })

      it('should not allow reading password input values', () => {
        const input = document.createElement('input')
        input.type = 'password'
        input.value = 'secret'
        input.id = 'password-input'
        document.body.appendChild(input)
        registerCleanupTask(() => input.remove())

        const displaySpy = spyOn(display, 'error')
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'dom',
          selector: '#password-input',
          attribute: 'value',
        })
        expect(value).toBeUndefined()
        expect(displaySpy).toHaveBeenCalled()
      })

      it('should call callback when resolving DOM value', () => {
        const element = document.createElement('div')
        element.textContent = 'test-content'
        element.id = 'callback-test'
        document.body.appendChild(element)
        registerCleanupTask(() => element.remove())

        const onDom = jasmine.createSpy()
        resolveDynamicValues(
          {
            rcSerializedType: 'dynamic',
            strategy: 'dom',
            selector: '#callback-test',
          },
          { onDom }
        )
        expect(onDom).toHaveBeenCalledWith('test-content')
      })
    })

    describe('dynamic JS path values', () => {
      beforeEach(() => {
        ;(window as any).testApp = {
          version: '2.0.0',
          config: {
            env: 'staging',
          },
        }
        registerCleanupTask(() => {
          delete (window as any).testApp
        })
      })

      it('should resolve window path values', () => {
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'js',
          path: 'testApp.version',
        })
        expect(value).toBe('2.0.0')
      })

      it('should resolve nested window paths', () => {
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'js',
          path: 'testApp.config.env',
        })
        expect(value).toBe('staging')
      })

      it('should return undefined if path does not exist', () => {
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'js',
          path: 'testApp.nonexistent.path',
        })
        expect(value).toBeUndefined()
      })

      it('should handle bracket notation paths', () => {
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'js',
          path: "testApp['version']",
        })
        expect(value).toBe('2.0.0')
      })

      it('should call callback when resolving JS value', () => {
        const onJs = jasmine.createSpy()
        resolveDynamicValues(
          {
            rcSerializedType: 'dynamic',
            strategy: 'js',
            path: 'testApp.version',
          },
          { onJs }
        )
        expect(onJs).toHaveBeenCalledWith('2.0.0')
      })
    })

    describe('complex nested structures', () => {
      it('should resolve nested configuration objects', () => {
        const config = {
          service: 'my-service',
          urls: [
            { rcSerializedType: 'string', value: 'url1' },
            { rcSerializedType: 'string', value: 'url2' },
          ],
          settings: {
            level: 2,
            enabled: true,
          },
        }
        const resolved = resolveDynamicValues(config)
        expect(resolved).toEqual({
          service: 'my-service',
          urls: ['url1', 'url2'],
          settings: {
            level: 2,
            enabled: true,
          },
        })
      })
    })

    describe('unsupported strategies', () => {
      it('should handle unsupported strategies gracefully', () => {
        const displaySpy = spyOn(display, 'error')
        const value = resolveDynamicValues({
          rcSerializedType: 'dynamic',
          strategy: 'unsupported' as any,
        })
        expect(value).toBeUndefined()
        expect(displaySpy).toHaveBeenCalledWith('Unsupported remote configuration: "strategy": "unsupported"')
      })

      it('should handle unsupported serialized types', () => {
        const displaySpy = spyOn(display, 'error')
        const value = resolveDynamicValues({
          rcSerializedType: 'unsupported',
          value: 'test',
        } as any)
        expect(value).toBeUndefined()
        expect(displaySpy).toHaveBeenCalledWith('Unsupported remote configuration: "rcSerializedType": "unsupported"')
      })
    })
  })

  describe('parseJsonPath', () => {
    it('should parse dot notation paths', () => {
      expect(parseJsonPath('foo.bar.baz')).toEqual(['foo', 'bar', 'baz'])
    })

    it('should parse bracket notation paths', () => {
      expect(parseJsonPath("['foo']['bar']")).toEqual(['foo', 'bar'])
    })

    it('should parse mixed notation paths', () => {
      expect(parseJsonPath("foo['bar'].baz")).toEqual(['foo', 'bar', 'baz'])
    })

    it('should parse array indices', () => {
      expect(parseJsonPath('items[0]')).toEqual(['items', '0'])
    })

    it('should return empty array for invalid paths', () => {
      expect(parseJsonPath("['foo")).toEqual([])
      expect(parseJsonPath('foo.')).toEqual([])
      expect(parseJsonPath('foo..bar')).toEqual([])
    })

    it('should handle escaped quotes', () => {
      expect(parseJsonPath("['foo\\'bar']")).toEqual(["foo'bar"])
    })
  })
})
