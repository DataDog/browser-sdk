import { globalObject } from '@datadog/browser-core'
import type { ShopifyAnalyticsApi } from './shopifyAnalytics'
import { getShopifyAnalytics } from './shopifyAnalytics'

interface TestGlobal {
  analytics?: ShopifyAnalyticsApi
}

describe('getShopifyAnalytics', () => {
  afterEach(() => {
    delete (globalObject as TestGlobal).analytics
  })

  it('returns undefined when the analytics global is absent', () => {
    expect(getShopifyAnalytics()).toBeUndefined()
  })

  it('returns the analytics global when present (auto-detected pixel context)', () => {
    const analytics: ShopifyAnalyticsApi = { subscribe: () => undefined }
    ;(globalObject as TestGlobal).analytics = analytics

    expect(getShopifyAnalytics()).toBe(analytics)
  })
})
