import { mockable } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi } from '../domain/shopifyAnalytics'
import { initShopifyBindings } from '../domain/shopifyBindings'
import { patchSandboxedIframeApis } from './patchSandboxedIframeApis'

interface ShopifyInitConfiguration extends RumInitConfiguration {
  shopifyAnalytics?: ShopifyAnalyticsApi
}

/**
 * Wraps `RumPublicApi.init()`. When the caller passes a `shopifyAnalytics` handle (the Custom
 * Pixel sandbox's `analytics` global) in the init configuration, patches the sandboxed iframe's
 * APIs, wires Shopify Web Pixel events to the RUM public API, and applies default configuration
 * suited to that iframe (see below). Otherwise (storefront context), forwards to `init()` as-is.
 */
export function makeShopifyRumPublicApi(datadogRum: RumPublicApi): RumPublicApi {
  return {
    ...datadogRum,
    init(initConfiguration: RumInitConfiguration | ShopifyInitConfiguration) {
      if ('shopifyAnalytics' in initConfiguration && initConfiguration.shopifyAnalytics) {
        const { shopifyAnalytics: analytics, ...initOptions } = initConfiguration
        mockable(patchSandboxedIframeApis)()
        mockable(initShopifyBindings)(datadogRum, analytics)

        return datadogRum.init({
          ...initOptions,
          trackViewsManually: true, // Views are started explicitly via startView()
          sessionReplaySampleRate: 0, // Session Replay is not usable in the Pixel sandbox iframe
          trackUserInteractions: false, // Pixel sandbox iframe has no real DOM to interact with
          trackResources: false, // Iframe resources are not meaningful
          trackLongTasks: false, // PerformanceObserver tracks the empty iframe
          sessionPersistence: 'cookie',
        })
      }

      return datadogRum.init(initConfiguration)
    },
  }
}
