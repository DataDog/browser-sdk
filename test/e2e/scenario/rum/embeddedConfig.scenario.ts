import { generateCombinedBundle } from '@datadog/browser-sdk-endpoint'
import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

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
})
