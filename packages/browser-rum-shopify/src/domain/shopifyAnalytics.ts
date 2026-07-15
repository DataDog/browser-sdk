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
  _DATADOG_SHOPIFY_FORCE_PIXEL_CONTEXT?: boolean
}

/**
 * Returns the `analytics` global injected by the Shopify Custom Pixel sandbox, or `undefined` if
 * the pixel is running outside that sandbox (e.g. loaded standalone for testing).
 *
 * Auto-detects the pixel sandbox context via the presence of the `analytics` global (the only
 * reliable signal — see https://shopify.dev/docs/api/web-pixels-api). `_DATADOG_SHOPIFY_FORCE_PIXEL_CONTEXT`
 * is an escape hatch overriding that detection: set it to `false` to force bindings off.
 */
export function getShopifyAnalytics(): ShopifyAnalyticsApi | undefined {
  const global = globalObject as ShopifyGlobal
  if (global._DATADOG_SHOPIFY_FORCE_PIXEL_CONTEXT === false) {
    return undefined
  }
  return global.analytics
}
