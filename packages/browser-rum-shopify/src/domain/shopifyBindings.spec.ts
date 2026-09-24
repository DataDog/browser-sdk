import type { RumPublicApi } from '@datadog/browser-rum-core'
import { createFakeAnalytics } from '../../test/mockShopifyAnalytics'
import { initShopifyBindings } from './shopifyBindings'

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

    it('starts a view on /checkout, /checkouts/*, and locale-prefixed checkout paths', () => {
      const urls = [
        'https://shop.example/checkout',
        'https://shop.example/checkouts/abc123',
        'https://shop.example/en-us/checkout',
      ]

      for (const url of urls) {
        expect(emitPageViewed(url)).toHaveBeenCalledTimes(1)
      }
    })

    it('does not start a view on storefront, /orders/*, Customer Account pages, or an undefined url', () => {
      const urls = [
        'https://shop.example/products/foo',
        'https://shop.example/orders/abc123',
        'https://shop.example/account/orders',
        undefined,
      ]

      for (const url of urls) {
        expect(emitPageViewed(url)).not.toHaveBeenCalled()
      }
    })
  })

  const checkoutContext = { document: { location: { href: 'https://shop.example/checkout' } } }

  it('maps "clicked" to a zero-duration startAction/stopAction pair named after the element id', () => {
    const { rumPublicApi, startAction, stopAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('clicked', {
      name: 'clicked',
      id: '11',
      timestamp: '2026-07-06T00:00:00Z',
      context: checkoutContext,
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
      context: checkoutContext,
      data: { element: {} },
    })

    expect(startAction).toHaveBeenCalledWith('element-without-id', { type: 'click' })
    expect(stopAction).toHaveBeenCalledWith('element-without-id', { type: 'click' })
  })

  it('does not report "clicked" outside a checkout page', () => {
    const { rumPublicApi, startAction, stopAction } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('clicked', {
      name: 'clicked',
      id: '13',
      timestamp: '2026-07-06T00:00:00Z',
      context: { document: { location: { href: 'https://shop.example/products/foo' } } },
      data: { element: { id: 'add-to-cart-button' } },
    })

    expect(startAction).not.toHaveBeenCalled()
    expect(stopAction).not.toHaveBeenCalled()
  })

  it('maps "ui_extension_errored" to addError with the flattened extension context', () => {
    const { rumPublicApi, addError } = createFakeRumPublicApi()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(rumPublicApi, analytics)
    emit('ui_extension_errored', {
      name: 'ui_extension_errored',
      id: '10',
      timestamp: '2026-07-06T00:00:00Z',
      context: checkoutContext,
      data: {
        error: {
          message: 'Boom',
          trace: 'stack trace',
          extensionName: 'my-extension',
          extensionTarget: 'purchase.checkout.block.render',
          type: 'RUNTIME',
          appId: 'gid://shopify/App/1',
          appName: 'my-app',
          appVersion: '1.2.3',
        },
      },
    })

    expect(addError).toHaveBeenCalledWith(jasmine.objectContaining({ message: 'Boom', stack: 'stack trace' }), {
      extensionName: 'my-extension',
      extensionTarget: 'purchase.checkout.block.render',
      extensionErrorType: 'RUNTIME',
      appId: 'gid://shopify/App/1',
      appName: 'my-app',
      appVersion: '1.2.3',
    })
  })
})
