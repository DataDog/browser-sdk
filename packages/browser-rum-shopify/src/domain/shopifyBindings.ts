import type { RumPublicApi } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from './shopifyAnalytics'

export interface CheckoutData {
  token?: string
}

export interface CheckoutStartedData extends CheckoutData {
  currencyCode?: string
  totalPrice?: unknown
}

export interface CheckoutShippingData extends CheckoutData {
  shippingLine?: { price?: unknown }
}

export interface CheckoutCompletedData extends CheckoutData {
  order?: { id?: string }
  totalPrice?: unknown
}

export interface AlertData {
  message?: string
  type?: string
  target?: string
  value?: unknown
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
  appName?: string
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
    rumPublicApi.startView({
      name: event.context?.document?.title,
      url: event.context?.document?.location?.href,
    })
  })

  analytics.subscribe('checkout_started', (event: ShopifyPixelEvent<{ checkout?: CheckoutStartedData }>) => {
    const checkout = event.data?.checkout
    rumPublicApi.addAction('checkout_started', {
      currencyCode: checkout?.currencyCode,
      totalPrice: checkout?.totalPrice,
    })
  })

  analytics.subscribe('checkout_contact_info_submitted', (event: ShopifyPixelEvent<{ checkout?: CheckoutData }>) => {
    const checkout = event.data?.checkout
    rumPublicApi.addAction('checkout_contact_info_submitted', {
      checkoutToken: checkout?.token,
    })
  })

  analytics.subscribe('checkout_address_info_submitted', (event: ShopifyPixelEvent<{ checkout?: CheckoutData }>) => {
    const checkout = event.data?.checkout
    rumPublicApi.addAction('checkout_address_info_submitted', {
      checkoutToken: checkout?.token,
    })
  })

  analytics.subscribe(
    'checkout_shipping_info_submitted',
    (event: ShopifyPixelEvent<{ checkout?: CheckoutShippingData }>) => {
      const checkout = event.data?.checkout
      rumPublicApi.addAction('checkout_shipping_info_submitted', {
        checkoutToken: checkout?.token,
        shippingPrice: checkout?.shippingLine?.price,
      })
    }
  )

  analytics.subscribe('payment_info_submitted', (event: ShopifyPixelEvent<{ checkout?: CheckoutData }>) => {
    const checkout = event.data?.checkout
    rumPublicApi.addAction('payment_info_submitted', {
      checkoutToken: checkout?.token,
    })
  })

  analytics.subscribe('checkout_completed', (event: ShopifyPixelEvent<{ checkout?: CheckoutCompletedData }>) => {
    const checkout = event.data?.checkout
    rumPublicApi.addAction('checkout_completed', {
      orderId: checkout?.order?.id,
      totalPrice: checkout?.totalPrice,
    })
  })

  // Fires on checkout validation errors (invalid card, missing field, inventory error, etc.) —
  // mapped as a custom action for funnel friction analysis.
  analytics.subscribe('alert_displayed', (event: ShopifyPixelEvent<{ alert?: AlertData }>) => {
    const alert = event.data?.alert
    rumPublicApi.addAction('alert_displayed', {
      message: alert?.message,
      type: alert?.type,
      target: alert?.target,
      value: alert?.value,
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
