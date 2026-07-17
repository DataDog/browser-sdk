import { globalObject } from '@datadog/browser-core'
import type { ShopifyAnalyticsApi } from './shopifyAnalytics'
import { getShopifyAnalytics } from './shopifyAnalytics'

interface TestGlobal {
  analytics?: ShopifyAnalyticsApi
  _DATADOG_SHOPIFY_FORCE_PIXEL_CONTEXT?: boolean
}

describe('getShopifyAnalytics', () => {
  afterEach(() => {
    delete (globalObject as TestGlobal).analytics
    delete (globalObject as TestGlobal)._DATADOG_SHOPIFY_FORCE_PIXEL_CONTEXT
  })

  it('returns undefined when the analytics global is absent', () => {
    expect(getShopifyAnalytics()).toBeUndefined()
  })

  it('returns the analytics global when present (auto-detected pixel context)', () => {
    const analytics: ShopifyAnalyticsApi = { subscribe: () => undefined }
    ;(globalObject as TestGlobal).analytics = analytics

    expect(getShopifyAnalytics()).toBe(analytics)
  })

  it('forces pixel bindings off when _DATADOG_SHOPIFY_FORCE_PIXEL_CONTEXT is false, even if analytics is present', () => {
    ;(globalObject as TestGlobal).analytics = { subscribe: () => undefined }
    ;(globalObject as TestGlobal)._DATADOG_SHOPIFY_FORCE_PIXEL_CONTEXT = false

    expect(getShopifyAnalytics()).toBeUndefined()
  })
})
