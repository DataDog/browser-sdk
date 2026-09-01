import { mockable } from '@datadog/browser-core'
import type { RumPlugin } from '@datadog/browser-rum-core'
import { patchSandboxedIframeApis } from '../boot/patchSandboxedIframeApis'
import type { ShopifyAnalyticsApi } from './shopifyAnalytics'
import { initShopifyBindings, isCheckoutPage } from './shopifyBindings'
import { waitForPageViewedEvent } from './shopifyAnalytics'

export interface ShopifyPluginConfiguration {
  shopifyAnalytics: ShopifyAnalyticsApi
}

/**
 * Adapts the RUM SDK to run inside a Shopify Custom Pixel sandbox. When `shopifyAnalytics` (the
 * sandbox's `analytics` global) is provided, patches the sandboxed iframe's APIs, wires Shopify
 * Web Pixel events to the RUM public API, and forces configuration suited to that iframe (see
 * below). Storefront pages don't provide `shopifyAnalytics` and shouldn't include this plugin.
 */
export function shopifyPlugin(configuration: ShopifyPluginConfiguration): RumPlugin {
  return {
    name: 'shopify',
    async onInit({ initConfiguration, publicApi }) {
      const analytics = configuration.shopifyAnalytics
      if (!analytics) {
        return false
      }

      const pageViewedEvent = await waitForPageViewedEvent(analytics)

      if (!isCheckoutPage(pageViewedEvent)) {
        return false
      }

      mockable(patchSandboxedIframeApis)()
      mockable(initShopifyBindings)(publicApi, analytics)

      initConfiguration.trackViewsManually = true // Views are started explicitly via startView()
      initConfiguration.sessionReplaySampleRate = 0 // Session Replay is not usable in the Pixel sandbox iframe
      initConfiguration.profilingSampleRate = 0 // Profiling is not usable in the Pixel sandbox iframe
      initConfiguration.trackUserInteractions = false // Pixel sandbox iframe has no real DOM to interact with
      initConfiguration.trackResources = false // Iframe resources are not meaningful
      initConfiguration.trackLongTasks = false // PerformanceObserver tracks the empty iframe
      initConfiguration.sessionPersistence = 'cookie'
    },
  }
}
