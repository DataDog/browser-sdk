import { test, expect } from '@playwright/test'
import { generateCombinedBundle } from '@datadog/browser-sdk-endpoint'
import { createTest, DEFAULT_RUM_CONFIGURATION, html, basePage, createCrossOriginScriptUrls } from '../../lib/framework'
import type { SetupOptions, Servers } from '../../lib/framework'

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

  createTest('should resolve dynamic cookie strategy for user context in embedded config')
    .withSetup(embeddedDynamicCookieSetup)
    .run(async ({ intakeRegistry, flushEvents, page, baseUrl }) => {
      // Set the uid cookie on the current page so it persists for the next navigation
      await page.evaluate(() => {
        document.cookie = 'uid=cookie-user-99; path=/'
      })
      // Navigate again so the embedded init code reads the cookie on page load
      await page.goto(baseUrl)
      await flushEvents()
      // At least one view event should have usr.id set to the cookie value.
      // (There may be events from the previous page load mixed in, so we check the last one
      // which is from the second load where the cookie was available during SDK init.)
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThanOrEqual(1)
      const lastViewEvent = viewEvents[viewEvents.length - 1]
      expect(lastViewEvent.usr?.id).toBe('cookie-user-99')
    })
})

/**
 * Setup factory for the dynamic cookie user-id test. Serves an HTML page that mimics
 * the embedded bundle produced by generateCombinedBundle() with a cookie-based dynamic value.
 */
function embeddedDynamicCookieSetup(options: SetupOptions, servers: Servers): string {
  const { rumScriptUrl } = createCrossOriginScriptUrls(servers, options)

  const embeddedConfig = {
    ...DEFAULT_RUM_CONFIGURATION,
    sessionSampleRate: 100,
    proxy: servers.intake.origin,
    user: [{ key: 'id', value: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'uid' } }],
  }
  const configJson = JSON.stringify(embeddedConfig)
  const testContextJson = JSON.stringify(options.context)

  const header = html`
    <script type="text/javascript" src="${rumScriptUrl}"></script>
    <script type="text/javascript">
      (function () {
        'use strict';
        var __DATADOG_REMOTE_CONFIG__ = ${configJson};
        var __dd_user = {};
        (__DATADOG_REMOTE_CONFIG__.user || []).forEach(function (item) {
          __dd_user[item.key] = __dd_resolveContextValue(item.value);
        });
        var hasUser = Object.keys(__dd_user).length > 0;
        window.DD_RUM.setGlobalContext(${testContextJson});
        window.DD_RUM.init(Object.assign({}, __DATADOG_REMOTE_CONFIG__, {
          user: hasUser ? __dd_user : undefined,
          context: undefined
        }));

        function __dd_resolveContextValue(value) {
          if (!value || typeof value !== 'object') { return value; }
          var serializedType = value.rcSerializedType;
          if (serializedType === 'string') { return value.value; }
          if (serializedType !== 'dynamic') { return undefined; }
          var strategy = value.strategy;
          if (strategy === 'cookie') { return __dd_getCookie(value.name); }
          return undefined;
        }

        function __dd_getCookie(name) {
          if (typeof name !== 'string') { return undefined; }
          var match = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + name + '=([^;]*)'));
          return match ? decodeURIComponent(match[1]) : undefined;
        }
      })();
    </script>
  `
  return basePage({ header })
}
