import type { RumPlugin } from '@datadog/browser-rum-core'

/**
 * Runs the RUM SDK in the Datadog Shopify app Web Pixel extension, which Shopify runs in a Web
 * Worker. Forces the configuration that works without a page: views are started manually and the
 * features that need a DOM or the checkout main thread are disabled.
 */
export function shopifyAppPixelPlugin(): RumPlugin {
  return {
    name: 'shopify-app-pixel',
    onInit({ initConfiguration }) {
      initConfiguration.trackViewsManually = true // Views are started from Shopify `page_viewed` events
      initConfiguration.trackUserInteractions = false // The worker has no DOM to interact with
      initConfiguration.trackResources = false // The worker only sees its own requests
      initConfiguration.trackLongTasks = false // The worker does not run on the checkout main thread
      initConfiguration.trackViewMetricsManually = true // The worker has no page to measure
      initConfiguration.sessionReplaySampleRate = 0 // Session Replay needs a DOM
      initConfiguration.profilingSampleRate = 0 // Profiling does not see the checkout main thread
      initConfiguration.sessionPersistence = 'memory' // The worker has no cookies
    },
  }
}
