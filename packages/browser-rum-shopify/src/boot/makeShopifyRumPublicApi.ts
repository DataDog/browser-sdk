import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'

// Matches /checkouts/*, /checkout, including locale-prefixed paths. 
// Storefront pages never match, so init() is a no-op there: those pages
// already get a `DD_RUM` instance from the Theme Liquid snippet, and initializing here too would
// create a second, independent SDK instance double-tracking the same page view.
const CHECKOUT_PATH = /\/(([a-z]{2}(-[a-z0-9]+)?)\/)?(checkouts?)(\/|$)/i

/**
 * Wraps a `RumPublicApi` instance, adding default init configuration for the Shopify Pixel sandbox
 * iframe and gating `init()` behind a checkout-path check so the pixel is a no-op on storefront
 * page views (the pixel's `page_viewed` event fires on every page, not just checkout).
 */
export function makeShopifyRumPublicApi(datadogRum: RumPublicApi, url: string | undefined): RumPublicApi {
  return {
    ...datadogRum,
    init(initConfiguration: RumInitConfiguration) {
      if (!url || !CHECKOUT_PATH.test(url)) {
        return
      }
      datadogRum.init({
        ...initConfiguration,
        trackViewsManually: true,         // Views are started explicitly via startView()
        sessionReplaySampleRate: 0,       // Session Replay is not usable in the Pixel sandbox iframe
        trackUserInteractions:   false,   // Pixel sandbox iframe has no real DOM to interact with
        trackResources:          false,   // Iframe resources are not meaningful
        trackLongTasks:          false,   // PerformanceObserver tracks the empty iframe
        sessionPersistence:      'cookie',
      })
    },
  }
}
