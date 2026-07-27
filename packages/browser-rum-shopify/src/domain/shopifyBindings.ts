import type { RumPublicApi } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from './shopifyAnalytics'

export interface ElementData {
  id?: string
}

export interface ErrorData {
  message?: string
  trace?: string
  extensionName?: string
  extensionTarget?: string
  type?: string
  appName?: string
}

// Matches /checkouts/*, /checkout, including locale-prefixed paths.
// Storefront pages never match, so init() is a no-op there: those pages
// already get a `DD_RUM` instance from the Theme Liquid snippet, and initializing here too would
// create a second, independent SDK instance double-tracking the same page view.
const CHECKOUT_PATH = /\/(([a-z]{2}(-[a-z0-9]+)?)\/)?(checkouts?)(\/|$)/i

/**
 * Wires Shopify Web Pixel standard events to the RUM public API. `analytics` is the sandbox's
 * `analytics` global (or `undefined` outside the sandbox, in which case bindings are skipped).
 */
export function initShopifyBindings(rumPublicApi: RumPublicApi, analytics: ShopifyAnalyticsApi | undefined) {
  if (!analytics) {
    return
  }

  analytics.subscribe('page_viewed', (event) => {
    const url = event.context?.document?.location?.href

    if (!url || !CHECKOUT_PATH.test(url)) {
      return
    }

    rumPublicApi.startView({
      url,
    })
  })

  analytics.subscribe('clicked', (event: ShopifyPixelEvent<{ element?: ElementData }>) => {
    const element = event.data?.element
    const name = element?.id ?? 'element-without-id'
    rumPublicApi.startAction(name, { type: 'click' })
    rumPublicApi.stopAction(name, { type: 'click' })
  })

  // Fires when a Shopify checkout UI extension crashes.
  analytics.subscribe('ui_extension_errored', (event: ShopifyPixelEvent<{ error?: ErrorData }>) => {
    const error = event.data?.error
    const err = new Error(error?.message)
    err.stack = error?.trace
    rumPublicApi.addError(err, {
      extension: {
        name: error?.extensionName,
        target: error?.extensionTarget,
        type: error?.type,
        appName: error?.appName,
      },
    })
  })
}
