import type { RumPublicApi } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from './shopifyAnalytics'
import { getPageUrl } from './shopifyAnalytics'

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

export function isCheckoutPage(event: ShopifyPixelEvent): boolean {
  const url = getPageUrl(event)
  return !!(url && CHECKOUT_PATH_PATTERN.test(url))
}

/**
 * Wires Shopify Web Pixel standard events to the RUM public API. `analytics` is the sandbox's
 * `analytics` global (or `undefined` outside the sandbox, in which case bindings are skipped).
 */
export function initShopifyBindings(rumPublicApi: RumPublicApi, analytics: ShopifyAnalyticsApi | undefined) {
  if (!analytics) {
    return
  }

  analytics.subscribe('page_viewed', (event) => {
    if (!isCheckoutPage(event)) {
      return
    }

    rumPublicApi.startView({
      url: getPageUrl(event),
    })
  })

  analytics.subscribe('clicked', (event: ShopifyPixelEvent<{ element?: ElementData }>) => {
    if (!isCheckoutPage(event)) {
      return
    }

    const element = event.data?.element
    const name = element?.id ?? 'element-without-id'
    rumPublicApi.startAction(name, { type: 'click' })
    rumPublicApi.stopAction(name, { type: 'click' })
  })

  // Fires when a Shopify checkout UI extension crashes.
  analytics.subscribe('ui_extension_errored', (event: ShopifyPixelEvent<{ error?: ErrorData }>) => {
    if (!isCheckoutPage(event)) {
      return
    }

    const error = event.data?.error
    const err = new Error(error?.message)
    err.stack = error?.trace
    rumPublicApi.addError(err, {
      extensionName: error?.extensionName,
      extensionTarget: error?.extensionTarget,
      extensionErrorType: error?.type,
      appId: error?.appId,
      appName: error?.appName,
      appVersion: error?.appVersion,
    })
  })
}
