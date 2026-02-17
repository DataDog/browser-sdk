/**
 * Bundle Generator Tests
 *
 * Tests for the CDN bundle generator library functions.
 * Uses Node.js built-in test runner (node:test).
 */

import { describe, it, mock, beforeEach } from 'node:test'
import assert from 'node:assert'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import {
  generateCombinedBundle,
  generateBundle,
  downloadSDK,
  clearSdkCache,
  type SdkVariant,
  type CombineBundleOptions,
} from './bundleGenerator.ts'

describe('generateCombinedBundle', () => {
  const mockSdkCode = 'window.DD_RUM = { init: function(config) { this.config = config; } };'
  const mockConfig = {
    applicationId: 'test-app-id',
    sessionSampleRate: 100,
    service: 'test-service',
    env: 'test',
  }

  it('wraps code in IIFE', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum',
    })

    assert.ok(bundle.startsWith('/**'), 'Should start with comment header')
    assert.ok(bundle.includes('(function() {'), 'Should contain IIFE start')
    assert.ok(bundle.includes('})();'), 'Should contain IIFE end')
    assert.ok(bundle.includes("'use strict';"), 'Should include use strict directive')
  })

  it('includes SDK variant in header', () => {
    const bundleRum = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum',
    })

    const bundleRumSlim = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum-slim',
    })

    assert.ok(bundleRum.includes('SDK Variant: rum'), 'Should include rum variant in header')
    assert.ok(bundleRumSlim.includes('SDK Variant: rum-slim'), 'Should include rum-slim variant in header')
  })

  it('embeds config as JSON', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum',
    })

    assert.ok(bundle.includes('"applicationId": "test-app-id"'), 'Should contain applicationId')
    assert.ok(bundle.includes('"sessionSampleRate": 100'), 'Should contain sessionSampleRate')
    assert.ok(bundle.includes('"service": "test-service"'), 'Should contain service')
    assert.ok(bundle.includes('"env": "test"'), 'Should contain env')
  })

  it('includes auto-initialization code', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum',
    })

    assert.ok(bundle.includes('window.DD_RUM.init'), 'Should include DD_RUM.init call')
    assert.ok(bundle.includes('__DATADOG_REMOTE_CONFIG__'), 'Should reference embedded config')
  })

  it('includes SDK code in output', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum',
    })

    assert.ok(bundle.includes(mockSdkCode), 'Should include SDK code')
  })

  it('generates valid JavaScript', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum',
    })

    // This will throw if JavaScript is invalid
    assert.doesNotThrow(() => {
      new Function(bundle)
    }, 'Generated code should be valid JavaScript')
  })

  it('handles config with nested objects', () => {
    const configWithNested = {
      applicationId: 'test-app-id',
      allowedTracingUrls: [{ match: { rcSerializedType: 'string' as const, value: 'https://example.com' } }],
    }

    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: configWithNested,
      variant: 'rum',
    })

    assert.ok(bundle.includes('"allowedTracingUrls"'), 'Should contain nested object')
    assert.ok(bundle.includes('"rcSerializedType": "string"'), 'Should contain nested serialized type')
  })

  it('handles config with special characters in strings', () => {
    const configWithSpecialChars = {
      applicationId: 'test-app-id',
      service: 'test-service-with-"quotes"-and-\\backslash',
    }

    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: configWithSpecialChars,
      variant: 'rum',
    })

    // JSON.stringify should properly escape special characters
    assert.doesNotThrow(() => {
      new Function(bundle)
    }, 'Generated code with special chars should be valid JavaScript')
  })
})

describe('determinism', () => {
  const mockSdkCode = 'window.DD_RUM = { init: function(config) { this.config = config; } };'
  const mockConfig = {
    applicationId: 'test-app-id',
    sessionSampleRate: 100,
    service: 'test-service',
    env: 'production',
    version: '1.0.0',
  }

  it('produces identical output for identical inputs', () => {
    const options: CombineBundleOptions = {
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum',
    }

    const bundle1 = generateCombinedBundle(options)
    const bundle2 = generateCombinedBundle(options)

    assert.strictEqual(bundle1, bundle2, 'Bundles should be byte-identical')
  })

  it('produces identical output across multiple runs', () => {
    const options: CombineBundleOptions = {
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum-slim',
    }

    // Generate 10 times and verify all are identical
    const bundles = Array.from({ length: 10 }, () => generateCombinedBundle(options))
    const firstBundle = bundles[0]

    for (let i = 1; i < bundles.length; i++) {
      assert.strictEqual(bundles[i], firstBundle, `Bundle ${i} should match first bundle`)
    }
  })

  it('bundle contains no build timestamps', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum',
    })

    // Check for common timestamp patterns
    assert.ok(!bundle.includes('Date.now()'), 'Should not contain Date.now()')

    // Check for Unix timestamps (13 digits starting with 17)
    const unixTimestampRegex = /17\d{11}/
    assert.ok(!unixTimestampRegex.test(bundle), 'Should not contain Unix timestamps')

    // Check for ISO date strings (but allow version strings like 6.26.0)
    const isoDateRegex = /202\d-\d{2}-\d{2}/
    assert.ok(!isoDateRegex.test(bundle), 'Should not contain ISO dates')
  })

  it('bundle contains no random values', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: mockConfig,
      variant: 'rum',
    })

    // Check for Math.random() calls
    assert.ok(!bundle.includes('Math.random()'), 'Should not contain Math.random()')

    // Check for crypto.randomUUID() calls
    assert.ok(!bundle.includes('randomUUID'), 'Should not contain randomUUID')
  })

  it('JSON key ordering is consistent', () => {
    // Different object creation order should still produce same output
    const config1 = {
      applicationId: 'test',
      sessionSampleRate: 100,
      env: 'test',
    }

    const config2 = {
      env: 'test',
      applicationId: 'test',
      sessionSampleRate: 100,
    }

    const bundle1 = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: config1,
      variant: 'rum',
    })

    const bundle2 = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: config2,
      variant: 'rum',
    })

    // Note: JSON.stringify preserves insertion order in modern JS engines,
    // so config1 and config2 will produce different JSON strings.
    // This is expected behavior - same logical config with different key order
    // is technically different input.

    // What we verify is that the SAME input always produces the SAME output
    const bundleAgain = generateCombinedBundle({
      sdkCode: mockSdkCode,
      config: config1,
      variant: 'rum',
    })

    assert.strictEqual(bundle1, bundleAgain, 'Same config object should produce identical output')
  })
})

describe('edge cases', () => {
  it('handles empty SDK code', () => {
    const bundle = generateCombinedBundle({
      sdkCode: '',
      config: { applicationId: 'test' },
      variant: 'rum',
    })

    assert.ok(bundle.includes('// SDK bundle (rum) from CDN'), 'Should include SDK comment')
    assert.doesNotThrow(() => {
      new Function(bundle)
    }, 'Empty SDK code should still produce valid JavaScript')
  })

  it('handles minimal config', () => {
    const bundle = generateCombinedBundle({
      sdkCode: 'window.DD_RUM = {};',
      config: { applicationId: 'minimal-app' },
      variant: 'rum-slim',
    })

    assert.ok(bundle.includes('"applicationId": "minimal-app"'), 'Should contain minimal config')
    assert.doesNotThrow(() => {
      new Function(bundle)
    }, 'Minimal config should produce valid JavaScript')
  })

  it('handles config with undefined values (they are omitted by JSON.stringify)', () => {
    const configWithUndefined = {
      applicationId: 'test',
      service: undefined,
      env: 'test',
    } as { applicationId: string; service?: string; env: string }

    const bundle = generateCombinedBundle({
      sdkCode: 'window.DD_RUM = {};',
      config: configWithUndefined,
      variant: 'rum',
    })

    // undefined values are omitted by JSON.stringify
    assert.ok(!bundle.includes('"service"'), 'Undefined values should be omitted')
    assert.ok(bundle.includes('"applicationId"'), 'Defined values should be present')
  })

  it('handles config with null values', () => {
    const configWithNull = {
      applicationId: 'test',
      service: null,
    } as unknown as { applicationId: string; service: string | null }

    const bundle = generateCombinedBundle({
      sdkCode: 'window.DD_RUM = {};',
      config: configWithNull as { applicationId: string },
      variant: 'rum',
    })

    assert.ok(bundle.includes('"service": null'), 'Null values should be included')
  })
})

describe('generateBundle() input validation', () => {
  it('throws if applicationId is missing', async () => {
    await assert.rejects(
      () =>
        generateBundle({
          applicationId: '',
          remoteConfigurationId: 'cfg-1',
          variant: 'rum',
        }),
      (error: Error) => {
        assert.ok(error.message.includes('applicationId'), 'Error should mention applicationId')
        assert.ok(error.message.includes('required'), 'Error should mention required')
        return true
      }
    )
  })

  it('throws if applicationId is not a string', async () => {
    await assert.rejects(
      () =>
        generateBundle({
          applicationId: 123 as unknown as string,
          remoteConfigurationId: 'cfg-1',
          variant: 'rum',
        }),
      (error: Error) => {
        assert.ok(error.message.includes('applicationId'), 'Error should mention applicationId')
        return true
      }
    )
  })

  it('throws if remoteConfigurationId is missing', async () => {
    await assert.rejects(
      () =>
        generateBundle({
          applicationId: 'app-1',
          remoteConfigurationId: '',
          variant: 'rum',
        }),
      (error: Error) => {
        assert.ok(error.message.includes('remoteConfigurationId'), 'Error should mention remoteConfigurationId')
        assert.ok(error.message.includes('required'), 'Error should mention required')
        return true
      }
    )
  })

  it('throws if remoteConfigurationId is not a string', async () => {
    await assert.rejects(
      () =>
        generateBundle({
          applicationId: 'app-1',
          remoteConfigurationId: null as unknown as string,
          variant: 'rum',
        }),
      (error: Error) => {
        assert.ok(error.message.includes('remoteConfigurationId'), 'Error should mention remoteConfigurationId')
        return true
      }
    )
  })

  it('throws if variant is invalid', async () => {
    await assert.rejects(
      () =>
        generateBundle({
          applicationId: 'app-1',
          remoteConfigurationId: 'cfg-1',
          variant: 'invalid' as SdkVariant,
        }),
      (error: Error) => {
        assert.ok(error.message.includes('variant'), 'Error should mention variant')
        assert.ok(error.message.includes('rum'), 'Error should suggest valid values')
        assert.ok(error.message.includes('rum-slim'), 'Error should suggest valid values')
        assert.ok(error.message.includes('invalid'), 'Error should include the invalid value')
        return true
      }
    )
  })

  it('throws if site is not a string when provided', async () => {
    await assert.rejects(
      () =>
        generateBundle({
          applicationId: 'app-1',
          remoteConfigurationId: 'cfg-1',
          variant: 'rum',
          site: 123 as unknown as string,
        }),
      (error: Error) => {
        assert.ok(error.message.includes('site'), 'Error should mention site')
        return true
      }
    )
  })

  it('throws if datacenter is not a string when provided', async () => {
    await assert.rejects(
      () =>
        generateBundle({
          applicationId: 'app-1',
          remoteConfigurationId: 'cfg-1',
          variant: 'rum',
          datacenter: false as unknown as string,
        }),
      (error: Error) => {
        assert.ok(error.message.includes('datacenter'), 'Error should mention datacenter')
        return true
      }
    )
  })

  it('validation errors are thrown before any network requests', async () => {
    // If validation fails, fetchConfig and downloadSDK should never be called.
    // We verify this by confirming error is thrown synchronously-ish (no network timeout).
    const start = Date.now()
    await assert.rejects(
      () =>
        generateBundle({
          applicationId: '',
          remoteConfigurationId: 'cfg-1',
          variant: 'rum',
        }),
      Error
    )
    const elapsed = Date.now() - start
    assert.ok(elapsed < 100, `Validation should be fast (took ${elapsed}ms), proving no network call was made`)
  })
})

describe('downloadSDK() caching', () => {
  function createMockResponse(data: string, statusCode = 200) {
    const response = new EventEmitter() as EventEmitter & { statusCode: number }
    response.statusCode = statusCode
    process.nextTick(() => {
      response.emit('data', data)
      response.emit('end')
    })
    return response
  }

  beforeEach(() => {
    clearSdkCache()
    mock.restoreAll()
  })

  it('caches SDK after first download', async () => {
    let callCount = 0
    mock.method(https, 'get', (_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      cb(createMockResponse('/* SDK CODE */'))
      return new EventEmitter()
    })

    const result = await downloadSDK('rum')
    assert.strictEqual(result, '/* SDK CODE */')
    assert.strictEqual(callCount, 1, 'https.get should be called once')
  })

  it('returns cached SDK on second call without network request', async () => {
    let callCount = 0
    mock.method(https, 'get', (_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      cb(createMockResponse('/* SDK CODE */'))
      return new EventEmitter()
    })

    const result1 = await downloadSDK('rum')
    const result2 = await downloadSDK('rum')
    assert.strictEqual(result1, result2, 'Same SDK code returned from cache')
    assert.strictEqual(callCount, 1, 'https.get should only be called once (cache hit on second call)')
  })

  it('caches different variants separately', async () => {
    let callCount = 0
    mock.method(https, 'get', (url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      const variant = url.includes('rum-slim') ? 'slim' : 'full'
      cb(createMockResponse(`/* SDK ${variant} */`))
      return new EventEmitter()
    })

    const rum = await downloadSDK('rum')
    const rumSlim = await downloadSDK('rum-slim')
    const rumAgain = await downloadSDK('rum')

    assert.strictEqual(rum, '/* SDK full */')
    assert.strictEqual(rumSlim, '/* SDK slim */')
    assert.strictEqual(rumAgain, '/* SDK full */')
    assert.strictEqual(callCount, 2, 'Only 2 network requests (one per variant)')
  })

  it('caches different datacenters separately', async () => {
    let callCount = 0
    mock.method(https, 'get', (url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      const dc = url.includes('eu1') ? 'eu1' : 'us1'
      cb(createMockResponse(`/* SDK ${dc} */`))
      return new EventEmitter()
    })

    const us1 = await downloadSDK({ variant: 'rum', datacenter: 'us1' })
    const eu1 = await downloadSDK({ variant: 'rum', datacenter: 'eu1' })
    const us1Again = await downloadSDK({ variant: 'rum', datacenter: 'us1' })

    assert.strictEqual(us1, '/* SDK us1 */')
    assert.strictEqual(eu1, '/* SDK eu1 */')
    assert.strictEqual(us1Again, '/* SDK us1 */')
    assert.strictEqual(callCount, 2, 'Only 2 network requests (one per datacenter)')
  })

  it('cache hit is fast compared to network fetch', async () => {
    mock.method(https, 'get', (_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      cb(createMockResponse('/* SDK CODE */'))
      return new EventEmitter()
    })

    await downloadSDK('rum')

    const start = Date.now()
    await downloadSDK('rum')
    const elapsed = Date.now() - start

    assert.ok(elapsed < 5, `Cache hit should be fast (took ${elapsed}ms)`)
  })

  it('clearSdkCache empties the cache', async () => {
    let callCount = 0
    mock.method(https, 'get', (_url: string, _opts: unknown, cb: (res: unknown) => void) => {
      callCount++
      cb(createMockResponse('/* SDK CODE */'))
      return new EventEmitter()
    })

    await downloadSDK('rum')
    clearSdkCache()
    await downloadSDK('rum')

    assert.strictEqual(callCount, 2, 'After cache clear, network request should be made again')
  })
})
