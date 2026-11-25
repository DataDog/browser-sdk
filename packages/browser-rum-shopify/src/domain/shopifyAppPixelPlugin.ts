import { mockable } from '@datadog/js-core/util'
import type { RumPlugin } from '@datadog/browser-rum-core'
import { setShopifyBrowserApi } from './shopifySessionStore'
import type { ShopifyBrowserApi } from './webPixelUtils'

export interface ShopifyAppPixelPluginConfiguration {
  /**
   * The Web Pixel `browser` API, received by the extension's `register()` callback. Shares the
   * storefront session with the app pixel; without it, the pixel keeps an isolated session.
   */
  browser?: ShopifyBrowserApi
}

/**
 * Runs the RUM SDK in the Datadog Shopify app Web Pixel extension, which Shopify runs in a Web
 * Worker: views are started manually and the features that need a DOM or the checkout main thread
 * are disabled.
 */
export function shopifyAppPixelPlugin(configuration: ShopifyAppPixelPluginConfiguration = {}): RumPlugin {
  return {
    name: 'shopify-app-pixel',
    onInit({ initConfiguration }) {
      if (configuration.browser) {
        mockable(setShopifyBrowserApi)(configuration.browser)
      }

      initConfiguration.trackViewsManually = true // Views are started from Shopify `page_viewed` events
      initConfiguration.trackUserInteractions = false // The worker has no DOM to interact with
      initConfiguration.trackResources = false // The worker only sees its own requests
      initConfiguration.trackLongTasks = false // The worker does not run on the checkout main thread
      initConfiguration.trackViewMetricsManually = true // The worker has no page to measure
      initConfiguration.sessionReplaySampleRate = 0 // Session Replay needs a DOM
      initConfiguration.profilingSampleRate = 0 // Profiling does not see the checkout main thread
      initConfiguration.trackSessionAcrossSubdomains = false // getCurrentSite() needs document.cookie, unavailable in the worker
    },
  }
}
