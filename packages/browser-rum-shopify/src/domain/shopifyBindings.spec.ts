import type { RumPublicApi } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from './shopifyAnalytics'
import { initShopifyBindings } from './shopifyBindings'

function createFakeAnalytics() {
  const subscribers = new Map<string, (event: ShopifyPixelEvent) => void>()
  const analytics: ShopifyAnalyticsApi = {
    subscribe: jasmine.createSpy('subscribe').and.callFake((eventName: string, callback) => {
      subscribers.set(eventName, callback)
    }),
  }
  return {
    analytics,
    emit: (eventName: string, event: ShopifyPixelEvent) => subscribers.get(eventName)?.(event),
  }
}

function createFakeRumPublicApi() {
  const startView = jasmine.createSpy('startView')
  const addAction = jasmine.createSpy('addAction')
  const addError = jasmine.createSpy('addError')
  const startAction = jasmine.createSpy('startAction')
  const stopAction = jasmine.createSpy('stopAction')
  const rumPublicApi = { startView, addAction, addError, startAction, stopAction } as unknown as RumPublicApi
  return { rumPublicApi, startView, addAction, addError, startAction, stopAction }
}

describe('initShopifyBindings', () => {
  it('does nothing when the Shopify analytics global is not available', () => {
    const { rumPublicApi, startView } = createFakeRumPublicApi()

    expect(() => initShopifyBindings(rumPublicApi, undefined)).not.toThrow()
    expect(startView).not.toHaveBeenCalled()
  })

  it('maps "page_viewed" to startView with the page title and url', () => {
    const { rumPublicApi, startView } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('page_viewed', {
      name: 'page_viewed',
      id: '1',
      timestamp: '2026-07-06T00:00:00Z',
      context: { document: { title: 'Home page', location: { href: 'https://shop.example/home' } } },
    })

    expect(startView).toHaveBeenCalledWith({ name: 'Home page', url: 'https://shop.example/home' })
  })

  it('maps "checkout_started" to addAction with the currency and total price', () => {
    const { rumPublicApi, addAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('checkout_started', {
      name: 'checkout_started',
      id: '2',
      timestamp: '2026-07-06T00:00:00Z',
      data: { checkout: { currencyCode: 'USD', totalPrice: { amount: 42 } } },
    })

    expect(addAction).toHaveBeenCalledWith('checkout_started', {
      currencyCode: 'USD',
      totalPrice: { amount: 42 },
    })
  })

  it('maps "checkout_contact_info_submitted" to addAction with the checkout token', () => {
    const { rumPublicApi, addAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('checkout_contact_info_submitted', {
      name: 'checkout_contact_info_submitted',
      id: '3',
      timestamp: '2026-07-06T00:00:00Z',
      data: { checkout: { email: 'jane@example.com', token: 'tok_1' } },
    })

    expect(addAction).toHaveBeenCalledWith('checkout_contact_info_submitted', { checkoutToken: 'tok_1' })
  })

  it('maps "checkout_address_info_submitted" to addAction with the checkout token', () => {
    const { rumPublicApi, addAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('checkout_address_info_submitted', {
      name: 'checkout_address_info_submitted',
      id: '5',
      timestamp: '2026-07-06T00:00:00Z',
      data: { checkout: { token: 'tok_3' } },
    })

    expect(addAction).toHaveBeenCalledWith('checkout_address_info_submitted', { checkoutToken: 'tok_3' })
  })

  it('maps "checkout_shipping_info_submitted" to addAction with the checkout token and shipping price', () => {
    const { rumPublicApi, addAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('checkout_shipping_info_submitted', {
      name: 'checkout_shipping_info_submitted',
      id: '6',
      timestamp: '2026-07-06T00:00:00Z',
      data: { checkout: { token: 'tok_4', shippingLine: { price: { amount: 5 } } } },
    })

    expect(addAction).toHaveBeenCalledWith('checkout_shipping_info_submitted', {
      checkoutToken: 'tok_4',
      shippingPrice: { amount: 5 },
    })
  })

  it('maps "payment_info_submitted" to addAction with the checkout token', () => {
    const { rumPublicApi, addAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('payment_info_submitted', {
      name: 'payment_info_submitted',
      id: '7',
      timestamp: '2026-07-06T00:00:00Z',
      data: { checkout: { token: 'tok_5' } },
    })

    expect(addAction).toHaveBeenCalledWith('payment_info_submitted', { checkoutToken: 'tok_5' })
  })

  it('maps "checkout_completed" to addAction with the order id and total price', () => {
    const { rumPublicApi, addAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('checkout_completed', {
      name: 'checkout_completed',
      id: '8',
      timestamp: '2026-07-06T00:00:00Z',
      data: { checkout: { order: { id: 'order_1' }, totalPrice: { amount: 42 } } },
    })

    expect(addAction).toHaveBeenCalledWith('checkout_completed', {
      orderId: 'order_1',
      totalPrice: { amount: 42 },
    })
  })

  it('maps "alert_displayed" to addAction with the alert details', () => {
    const { rumPublicApi, addAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('alert_displayed', {
      name: 'alert_displayed',
      id: '9',
      timestamp: '2026-07-06T00:00:00Z',
      data: { alert: { message: 'Invalid card', type: 'PAYMENT_ERROR', target: 'payment.card', value: undefined } },
    })

    expect(addAction).toHaveBeenCalledWith('alert_displayed', {
      message: 'Invalid card',
      type: 'PAYMENT_ERROR',
      target: 'payment.card',
      value: undefined,
    })
  })

  it('maps "clicked" to a zero-duration startAction/stopAction pair named after the element id', () => {
    const { rumPublicApi, startAction, stopAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('clicked', {
      name: 'clicked',
      id: '11',
      timestamp: '2026-07-06T00:00:00Z',
      data: { element: { id: 'add-to-cart-button', value: undefined, href: undefined } },
    })

    expect(startAction).toHaveBeenCalledWith('add-to-cart-button', { type: 'click' })
    expect(stopAction).toHaveBeenCalledWith('add-to-cart-button', { type: 'click' })
  })

  it('reports "clicked" when the element has no id', () => {
    const { rumPublicApi, startAction, stopAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('clicked', {
      name: 'clicked',
      id: '12',
      timestamp: '2026-07-06T00:00:00Z',
      data: { element: {} },
    })

    expect(startAction).toHaveBeenCalledWith('element-without-id', { type: 'click' })
    expect(stopAction).toHaveBeenCalledWith('element-without-id', { type: 'click' })
  })

  it('maps "ui_extension_errored" to addError with the extension context', () => {
    const { rumPublicApi, addError } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('ui_extension_errored', {
      name: 'ui_extension_errored',
      id: '10',
      timestamp: '2026-07-06T00:00:00Z',
      data: {
        error: {
          message: 'Boom',
          trace: 'stack trace',
          extensionName: 'my-extension',
          extensionTarget: 'purchase.checkout.block.render',
          type: 'RUNTIME',
          appName: 'my-app',
        },
      },
    })

    expect(addError).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 'Boom', stack: 'stack trace' }),
      {
        extension: {
          name: 'my-extension',
          target: 'purchase.checkout.block.render',
          type: 'RUNTIME',
          appName: 'my-app',
        },
      }
    )
  })
})
