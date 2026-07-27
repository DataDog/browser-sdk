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

  it('maps "page_viewed" to startView with the url, when the page is a checkout page', () => {
    const { rumPublicApi, startView } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('page_viewed', {
      name: 'page_viewed',
      id: '1',
      timestamp: '2026-07-06T00:00:00Z',
      context: { document: { title: 'Checkout', location: { href: 'https://shop.example/checkout' } } },
    })

    expect(startView).toHaveBeenCalledWith({ url: 'https://shop.example/checkout' })
  })

  describe('"page_viewed" checkout-path gating', () => {
    function emitPageViewed(url: string | undefined) {
      const { rumPublicApi, startView } = createFakeRumPublicApi()
      const { analytics, emit } = createFakeAnalytics()

      initShopifyBindings(rumPublicApi, analytics)
      emit('page_viewed', {
        name: 'page_viewed',
        id: '1',
        timestamp: '2026-07-06T00:00:00Z',
        context: { document: { title: 'Page', location: { href: url } } },
      })

      return startView
    }

    it('does not start a view on storefront pages', () => {
      expect(emitPageViewed('https://shop.example/products/foo')).not.toHaveBeenCalled()
    })

    it('starts a view on /checkout and /checkouts/* pages', () => {
      expect(emitPageViewed('https://shop.example/checkout')).toHaveBeenCalledTimes(1)
      expect(emitPageViewed('https://shop.example/checkouts/abc123')).toHaveBeenCalledTimes(1)
    })

    it('does not start a view on /orders/* pages (Order Status)', () => {
      expect(emitPageViewed('https://shop.example/orders/abc123')).not.toHaveBeenCalled()
    })

    it('does not start a view on Customer Account pages', () => {
      expect(emitPageViewed('https://shop.example/account/orders')).not.toHaveBeenCalled()
    })

    it('starts a view on locale-prefixed checkout paths', () => {
      expect(emitPageViewed('https://shop.example/en-us/checkout')).toHaveBeenCalledTimes(1)
    })

    it('does not start a view when the url is undefined', () => {
      expect(emitPageViewed(undefined)).not.toHaveBeenCalled()
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

    expect(addError).toHaveBeenCalledWith(jasmine.objectContaining({ message: 'Boom', stack: 'stack trace' }), {
      extension: {
        name: 'my-extension',
        target: 'purchase.checkout.block.render',
        type: 'RUNTIME',
        appName: 'my-app',
      },
    })
  })
})
