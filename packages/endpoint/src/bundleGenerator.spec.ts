import { describe, it } from 'node:test'
import assert from 'node:assert'
import { generateCombinedBundle } from './bundleGenerator.ts'
import { INLINE_HELPERS } from './helpers.ts'

const mockSdkCode = 'window.DD_RUM = { init: function(c) { this.config = c; } };'

describe('generateCombinedBundle', () => {
  it('wraps output in an IIFE', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      configJs: '{ "sessionSampleRate": 24 }',
      variant: 'rum',
    })
    assert.ok(bundle.includes('(function() {'), 'Should contain IIFE start')
    assert.ok(bundle.includes('})();'), 'Should contain IIFE end')
    assert.ok(bundle.includes("'use strict';"), 'Should include use strict')
  })

  it('embeds configJs verbatim without re-serializing', () => {
    const configJs = '{ "sessionSampleRate": 24, "user": { id: __dd_getJs(\'window.user\') } }'
    const bundle = generateCombinedBundle({ sdkCode: mockSdkCode, configJs, variant: 'rum' })
    assert.ok(bundle.includes(configJs), 'Should embed configJs verbatim')
  })

  it('always includes all six inline helpers', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      configJs: '{ "sessionSampleRate": 100 }',
      variant: 'rum',
    })
    assert.ok(bundle.includes('__dd_getCookie'), 'Should include cookie helper')
    assert.ok(bundle.includes('__dd_getJs'), 'Should include JS helper')
    assert.ok(bundle.includes('__dd_getDomText'), 'Should include DOM text helper')
    assert.ok(bundle.includes('__dd_getDomAttr'), 'Should include DOM attr helper')
    assert.ok(bundle.includes('__dd_getLocalStorage'), 'Should include localStorage helper')
    assert.ok(bundle.includes('__dd_extract'), 'Should include extract helper')
  })

  it('includes variant in header comment', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      configJs: '{}',
      variant: 'rum-slim',
    })
    assert.ok(bundle.includes('SDK Variant: rum-slim'), 'Should include variant in header')
  })

  it('includes SDK version in header when provided', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      configJs: '{}',
      variant: 'rum',
      sdkVersion: '6.28.0',
    })
    assert.ok(bundle.includes('SDK Version: 6.28.0'), 'Should include version in header')
  })

  it('calls DD_RUM.init with the embedded config variable', () => {
    const bundle = generateCombinedBundle({
      sdkCode: mockSdkCode,
      configJs: '{ "sessionSampleRate": 50 }',
      variant: 'rum',
    })
    assert.ok(bundle.includes('window.DD_RUM.init(__DATADOG_REMOTE_CONFIG__)'), 'Should call DD_RUM.init')
  })

  it('a config with only static values contains no helper calls in the config section', () => {
    const configJs = '{ "sessionSampleRate": 24, "env": "prod" }'
    const bundle = generateCombinedBundle({ sdkCode: mockSdkCode, configJs, variant: 'rum' })
    // helpers are present as function definitions but not called from the config
    const configSection = bundle.split('var __DATADOG_REMOTE_CONFIG__')[1].split(';')[0]
    assert.ok(!configSection.includes('__dd_getCookie('), 'Static config should not call cookie helper')
    assert.ok(!configSection.includes('__dd_getJs('), 'Static config should not call JS helper')
  })

  it('a config with dynamic values embeds helper calls in the config section', () => {
    const configJs = '{ "user": { id: __dd_getJs(\'window.user\') } }'
    const bundle = generateCombinedBundle({ sdkCode: mockSdkCode, configJs, variant: 'rum' })
    const configSection = bundle.split('var __DATADOG_REMOTE_CONFIG__')[1].split(';')[0]
    assert.ok(configSection.includes("__dd_getJs('window.user')"), 'Dynamic config should call JS helper')
  })
})

describe('INLINE_HELPERS', () => {
  it('defines all six helper functions', () => {
    assert.ok(INLINE_HELPERS.includes('function __dd_getCookie'), 'Should define getCookie')
    assert.ok(INLINE_HELPERS.includes('function __dd_getJs'), 'Should define getJs')
    assert.ok(INLINE_HELPERS.includes('function __dd_getDomText'), 'Should define getDomText')
    assert.ok(INLINE_HELPERS.includes('function __dd_getDomAttr'), 'Should define getDomAttr')
    assert.ok(INLINE_HELPERS.includes('function __dd_getLocalStorage'), 'Should define getLocalStorage')
    assert.ok(INLINE_HELPERS.includes('function __dd_extract'), 'Should define extract')
  })

  it('is valid JavaScript', () => {
    // Wrapping in a function and parsing via Function constructor validates syntax
    assert.doesNotThrow(() => new Function(INLINE_HELPERS), 'INLINE_HELPERS should be valid JS')
  })
})
