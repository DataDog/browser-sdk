import { globalObject } from '@datadog/browser-core'

/**
 * Payload shape for Shopify Web Pixel standard events.
 * See https://shopify.dev/docs/api/web-pixels-api/standard-events
 */
export interface ShopifyPixelEvent<TData = Record<string, unknown>> {
  name: string
  id: string
  timestamp: string
  context?: {
    document?: {
      location?: { href?: string }
      title?: string
    }
  }
  data?: TData
}

export interface ShopifyAnalyticsApi {
  subscribe: (eventName: string, callback: (event: ShopifyPixelEvent) => void) => void
}

interface ShopifyGlobal {
  analytics?: ShopifyAnalyticsApi
}

/**
 * Returns the `analytics` global injected by the Shopify Custom Pixel sandbox, or `undefined` if
 * the pixel is running outside that sandbox (e.g. a storefront page).
 *
 * Auto-detects the pixel sandbox context via the presence of the `analytics` global — the only
 * reliable signal, see https://shopify.dev/docs/api/web-pixels-api.
 */
export function getShopifyAnalytics(): ShopifyAnalyticsApi | undefined {
  const global = globalObject as ShopifyGlobal
  return global.analytics
}
