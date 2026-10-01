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

export interface ElementData {
  id?: string
}

export interface ErrorData {
  message?: string
  trace?: string
  extensionName?: string
  extensionTarget?: string
  type?: string
  appId?: string
  appName?: string
  appVersion?: string
}

// Matches /checkouts/*, /checkout, including locale-prefixed paths.
export const CHECKOUT_PATH_PATTERN = /\/(([a-z]{2}(-[a-z0-9]+)?)\/)?(checkouts?)(\/|$)/i

export function getPageUrl(event: ShopifyPixelEvent): string | undefined {
  return event.context?.document?.location?.href
}

export function isCheckoutPage(event: ShopifyPixelEvent): boolean {
  const url = getPageUrl(event)
  return !!(url && CHECKOUT_PATH_PATTERN.test(url))
}
