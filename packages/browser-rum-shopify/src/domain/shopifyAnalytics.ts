import { waitForThenable } from '@datadog/browser-core'

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

export function getPageUrl(event: ShopifyPixelEvent): string | undefined {
  return event.context?.document?.location?.href
}

export interface WaitForPageViewedEventOptions {
  timeout?: number
}
export function waitForPageViewedEvent(
  analytics: ShopifyAnalyticsApi,
  { timeout = 1000 }: WaitForPageViewedEventOptions = {}
): Promise<ShopifyPixelEvent> {
  return waitForThenable(
    new Promise((resolve) => {
      analytics.subscribe('page_viewed', (event) => {
        resolve(event)
      })
    }),
    timeout
  )
}
