import { test, expect } from '@playwright/test'
import { generateCombinedBundle } from '@datadog/browser-sdk-endpoint'

test.describe('embedded configuration with dynamic values', () => {
  test('preserves cookie dynamic value markers in generated bundle', () => {
    const config = {
      applicationId: 'dynamic-cookie-app',
      clientToken: 'pub-test-token',
      version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'app_version' },
    }

    const bundle = generateCombinedBundle({
      sdkCode: '// SDK',
      config,
      variant: 'rum',
    })

    expect(bundle).toContain('"rcSerializedType": "dynamic"')
    expect(bundle).toContain('"strategy": "cookie"')
    expect(bundle).toContain('"name": "app_version"')
  })

  test('preserves DOM selector dynamic value markers in generated bundle', () => {
    const config = {
      applicationId: 'dynamic-dom-app',
      clientToken: 'pub-test-token',
      version: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#tracking-id' },
    }

    const bundle = generateCombinedBundle({
      sdkCode: '// SDK',
      config,
      variant: 'rum',
    })

    expect(bundle).toContain('"strategy": "dom"')
    expect(bundle).toContain('"selector": "#tracking-id"')
  })

  test('preserves DOM attribute dynamic value markers in generated bundle', () => {
    const config = {
      applicationId: 'dynamic-dom-attr-app',
      clientToken: 'pub-test-token',
      version: {
        rcSerializedType: 'dynamic',
        strategy: 'dom',
        selector: '#app-meta',
        attribute: 'data-version',
      },
    }

    const bundle = generateCombinedBundle({
      sdkCode: '// SDK',
      config,
      variant: 'rum',
    })

    expect(bundle).toContain('"strategy": "dom"')
    expect(bundle).toContain('"selector": "#app-meta"')
    expect(bundle).toContain('"attribute": "data-version"')
  })

  test('preserves JS path dynamic value markers in generated bundle', () => {
    const config = {
      applicationId: 'dynamic-js-app',
      clientToken: 'pub-test-token',
      version: { rcSerializedType: 'dynamic', strategy: 'js', path: 'appState.tracking.version' },
    }

    const bundle = generateCombinedBundle({
      sdkCode: '// SDK',
      config,
      variant: 'rum',
    })

    expect(bundle).toContain('"strategy": "js"')
    expect(bundle).toContain('"path": "appState.tracking.version"')
  })

  test('mixed static and dynamic values coexist in generated bundle', () => {
    const config = {
      applicationId: 'mixed-config-app',
      clientToken: 'pub-test-token',
      sessionSampleRate: 80,
      service: 'static-service',
      version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'app_version' },
      env: { rcSerializedType: 'dynamic', strategy: 'js', path: 'deployment.env' },
    }

    const bundle = generateCombinedBundle({
      sdkCode: '// SDK',
      config,
      variant: 'rum',
    })

    // Static values embedded
    expect(bundle).toContain('"applicationId": "mixed-config-app"')
    expect(bundle).toContain('"sessionSampleRate": 80')
    expect(bundle).toContain('"service": "static-service"')

    // Dynamic markers preserved
    expect(bundle).toContain('"strategy": "cookie"')
    expect(bundle).toContain('"strategy": "js"')
    expect(bundle).toContain('"name": "app_version"')
    expect(bundle).toContain('"path": "deployment.env"')
  })

  test('nested dynamic values preserve structure in generated bundle', () => {
    const config = {
      applicationId: 'nested-dynamic-app',
      clientToken: 'pub-test-token',
      allowedTracingUrls: [
        {
          match: { rcSerializedType: 'string' as const, value: 'https://api.example.com' },
          propagatorTypes: ['tracecontext'],
        },
      ],
      user: [
        { key: 'id', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'user_id' } },
        { key: 'email', value: { rcSerializedType: 'dynamic', strategy: 'js', path: 'userData.email' } },
      ],
    }

    const bundle = generateCombinedBundle({
      sdkCode: '// SDK',
      config,
      variant: 'rum',
    })

    expect(bundle).toContain('"rcSerializedType": "string"')
    expect(bundle).toContain('"value": "https://api.example.com"')
    expect(bundle).toContain('"propagatorTypes"')
    expect(bundle).toContain('"key": "id"')
    expect(bundle).toContain('"key": "email"')
    expect(bundle).toContain('"name": "user_id"')
    expect(bundle).toContain('"path": "userData.email"')
  })

  test('generated bundle with dynamic values is valid JavaScript', () => {
    const config = {
      applicationId: 'valid-js-app',
      clientToken: 'pub-test-token',
      version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'missing_cookie' },
      env: { rcSerializedType: 'dynamic', strategy: 'dom', selector: '#nonexistent' },
      service: { rcSerializedType: 'dynamic', strategy: 'js', path: 'window.nonexistent.path' },
    }

    const bundle = generateCombinedBundle({
      sdkCode: 'window.__TEST_LOADED__ = true;',
      config,
      variant: 'rum',
    })

    // Bundle should be valid JavaScript even with complex dynamic values
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    expect(() => new Function(bundle)).not.toThrow()
  })
})
