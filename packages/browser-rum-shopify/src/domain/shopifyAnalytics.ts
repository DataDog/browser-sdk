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
