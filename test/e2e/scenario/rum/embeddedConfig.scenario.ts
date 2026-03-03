import { generateCombinedBundle, CONTEXT_RESOLUTION_HELPERS } from '@datadog/browser-sdk-endpoint'
import { test, expect } from '@playwright/test'
import { createTest, DEFAULT_RUM_CONFIGURATION, html, basePage, createCrossOriginScriptUrls } from '../../lib/framework'
import type { SetupOptions, Servers } from '../../lib/framework'

export interface ContextItem {
  key: string
  value: { rcSerializedType: string; value?: string; strategy?: string; name?: string; path?: string; selector?: string; attribute?: string; extractor?: unknown }
}

/**
 * Creates a SetupFactory that generates an HTML page mimicking the embedded config bundle
 * produced by generateCombinedBundle(), with context resolution for user and globalContext.
 * Uses CONTEXT_RESOLUTION_HELPERS verbatim so tests exercise the same code as production.
 *
 * @param extraConfig - optional user[] / context[] arrays and optional pre-SDK script
 * @param extraConfig.user - optional user context items
 * @param extraConfig.context - optional global context items
 * @param extraConfig.preSDKScript - extra inline JS injected before the SDK script tag (e.g. to pre-set a cookie)
 */
export function createEmbeddedConfigSetup(extraConfig: {
  user?: ContextItem[]
  context?: ContextItem[]
  /** Extra inline JS injected before the SDK script tag (e.g. to pre-set a cookie). */
  preSDKScript?: string
}) {
  return (options: SetupOptions, servers: Servers): string => {
    const { rumScriptUrl } = createCrossOriginScriptUrls(servers, options)

    const embeddedConfig = {
      ...DEFAULT_RUM_CONFIGURATION,
      sessionSampleRate: 100,
      proxy: servers.intake.origin,
      ...extraConfig,
    }
    const configJson = JSON.stringify(embeddedConfig)
    const testContextJson = JSON.stringify(options.context)

    const header = html`
      ${extraConfig.preSDKScript ? `<script type="text/javascript">${extraConfig.preSDKScript}</script>` : ''}
      <script type="text/javascript" src="${rumScriptUrl}"></script>
      <script type="text/javascript">
        (function () {
          'use strict';
          var __DATADOG_REMOTE_CONFIG__ = ${configJson};
          var __dd_user = {};
          (__DATADOG_REMOTE_CONFIG__.user || []).forEach(function (item) {
            __dd_user[item.key] = __dd_resolveContextValue(item.value);
          });
          var __dd_globalContext = {};
          (__DATADOG_REMOTE_CONFIG__.context || []).forEach(function (item) {
            __dd_globalContext[item.key] = __dd_resolveContextValue(item.value);
          });
          var hasUser = Object.keys(__dd_user).length > 0;
          var hasGlobalContext = Object.keys(__dd_globalContext).length > 0;
          window.DD_RUM.init(Object.assign({}, __DATADOG_REMOTE_CONFIG__, {
            user: hasUser ? __dd_user : undefined,
            context: undefined,
            globalContext: hasGlobalContext ? __dd_globalContext : undefined
          }));
          // Re-apply test isolation context after init so it is not overwritten by the
          // globalContext init option (setContext replaces; we add test properties back).
          var __dd_testContext = ${testContextJson};
          Object.keys(__dd_testContext).forEach(function(key) {
            window.DD_RUM.setGlobalContextProperty(key, __dd_testContext[key]);
          });

          ${CONTEXT_RESOLUTION_HELPERS.trim()}
        })();
      </script>
    `
    return basePage({ header })
  }
}

test.describe('embedded configuration', () => {
  createTest('should load SDK with embedded config and expose getInitConfiguration')
    .withRum({
      sessionSampleRate: 75,
      service: 'embedded-config-test',
      env: 'staging',
    })
    .run(async ({ page }) => {
      const initConfig = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfig).toBeDefined()
      expect(initConfig.service).toBe('embedded-config-test')
      expect(initConfig.env).toBe('staging')
    })

  createTest('should send RUM view events with embedded config')
    .withRum({
      sessionSampleRate: 100,
    })
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()
      expect(intakeRegistry.rumViewEvents.length).toBeGreaterThanOrEqual(1)
    })

  createTest('should work with rum-slim variant')
    .withRum({
      service: 'slim-embedded-test',
    })
    .withRumSlim()
    .run(async ({ page }) => {
      const initConfig = await page.evaluate(() => window.DD_RUM!.getInitConfiguration()!)
      expect(initConfig).toBeDefined()
      expect(initConfig.service).toBe('slim-embedded-test')
    })

  test('generateCombinedBundle produces valid JavaScript bundle', () => {
    const sdkCode = 'window.__TEST_SDK_LOADED__ = true;'
    const config = {
      applicationId: 'test-app-id',
      clientToken: 'pub-test-token',
      sessionSampleRate: 100,
    }

    const bundle = generateCombinedBundle({
      sdkCode,
      config,
      variant: 'rum',
    })

    // Bundle is valid JavaScript
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    expect(() => new Function(bundle)).not.toThrow()

    // Bundle contains the embedded config
    expect(bundle).toContain('"applicationId": "test-app-id"')
    expect(bundle).toContain('"sessionSampleRate": 100')

    // Bundle contains SDK code
    expect(bundle).toContain('__TEST_SDK_LOADED__')

    // Bundle has correct metadata
    expect(bundle).toContain('SDK Variant: rum')
    expect(bundle).toContain('Embedded Remote Configuration')
    expect(bundle).toContain('No additional network requests needed')
  })

  test('generateCombinedBundle wraps content in IIFE with auto-init', () => {
    const sdkCode = '// SDK placeholder'
    const config = {
      applicationId: 'iife-test-app',
      clientToken: 'pub-test-token',
    }

    const bundle = generateCombinedBundle({
      sdkCode,
      config,
      variant: 'rum',
    })

    expect(bundle).toContain('(function() {')
    expect(bundle).toContain("'use strict';")
    expect(bundle).toContain('__DATADOG_REMOTE_CONFIG__')
    expect(bundle).toContain('DD_RUM.init(__DATADOG_REMOTE_CONFIG__)')
    expect(bundle).toContain('})();')
  })

  test('generateCombinedBundle preserves config with dynamic value markers', () => {
    const sdkCode = '// SDK placeholder'
    const config = {
      applicationId: 'dynamic-test-app',
      clientToken: 'pub-test-token',
      version: { rcSerializedType: 'dynamic', strategy: 'cookie', name: 'app_version' },
    }

    const bundle = generateCombinedBundle({
      sdkCode,
      config,
      variant: 'rum',
    })

    // Dynamic markers should be preserved as-is in the bundle
    expect(bundle).toContain('"rcSerializedType": "dynamic"')
    expect(bundle).toContain('"strategy": "cookie"')
    expect(bundle).toContain('"name": "app_version"')
  })

  createTest('should not make requests to remote config endpoint when config is embedded')
    .withRum({
      sessionSampleRate: 100,
    })
    .run(async ({ page, servers: _servers }) => {
      // The SDK with embedded config (via .withRum()) should not fetch remote config
      // since no remoteConfigurationId is provided
      const configRequests: string[] = []

      page.on('request', (request) => {
        if (request.url().includes('/config') || request.url().includes('sdk-configuration')) {
          configRequests.push(request.url())
        }
      })

      // Wait for any potential config fetches
      await page.waitForTimeout(2000)

      // No remote config requests should have been made
      expect(configRequests).toHaveLength(0)
    })

  createTest('should apply static user context from embedded config to view events')
    .withSetup(createEmbeddedConfigSetup({ user: [{ key: 'id', value: { rcSerializedType: 'string', value: 'test-user-42' } }] }))
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()
      expect(intakeRegistry.rumViewEvents.length).toBeGreaterThanOrEqual(1)
      expect(intakeRegistry.rumViewEvents[0].usr?.id).toBe('test-user-42')
    })

  createTest('should apply static globalContext from embedded config to view events')
    .withSetup(createEmbeddedConfigSetup({ context: [{ key: 'plan', value: { rcSerializedType: 'string', value: 'enterprise' } }] }))
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()
      expect(intakeRegistry.rumViewEvents.length).toBeGreaterThanOrEqual(1)
      expect(intakeRegistry.rumViewEvents[0].context?.plan).toBe('enterprise')
    })
})
