import type { RumInternalApi } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from './shopifyAnalytics'
import { initShopifyBindings } from './shopifyBindings'

function createFakeAnalytics(): {
  analytics: ShopifyAnalyticsApi
  emit: (eventName: string, event: ShopifyPixelEvent) => void
} {
  const subscribers = new Map<string, (event: ShopifyPixelEvent) => void>()
  const analytics = {
    subscribe: jasmine
      .createSpy('subscribe')
      .and.callFake((eventName: string, callback: (event: ShopifyPixelEvent) => void) => {
        subscribers.set(eventName, callback)
      }),
  }
  return {
    analytics,
    emit: (eventName: string, event: ShopifyPixelEvent) => subscribers.get(eventName)?.(event),
  }
}

function createFakeInternalApiForShopify() {
  // The shared helper records view *names* while Shopify views carry a url; a local fake keeps
  // the spec assertions straightforward (urls + one-shot actions). v2: view handles only expose
  // current/update — endings are owned by the real internal API, nothing to fake.
  const startEvent = jasmine.createSpy('startEvent').and.callFake(() => {
    const handle = {
      current: () => ({}) as never,
      update: jasmine.createSpy('update'),
    }
    return handle
  })
  const addEvent = jasmine.createSpy('addEvent')
  const internalApi = {
    startEvent,
    addEvent,
    registerHook: () => ({ stop: () => undefined }),
    notifications: { subscribe: () => () => undefined },
    findEvents: () => [],
    findSession: () => undefined,
    stop: () => undefined,
  } as unknown as RumInternalApi
  return {
    internalApi,
    startEvent,
    addEvent,
  }
}

describe('initShopifyBindings', () => {
  it('does nothing when the Shopify analytics global is not available', () => {
    const { internalApi, startEvent, addEvent } = createFakeInternalApiForShopify()

    expect(() => initShopifyBindings(internalApi, undefined)).not.toThrow()
    expect(startEvent).not.toHaveBeenCalled()
    expect(addEvent).not.toHaveBeenCalled()
  })

  it('subscribes to the Shopify Web Pixel standard events', () => {
    const { internalApi } = createFakeInternalApiForShopify()
    const { analytics } = createFakeAnalytics()

    initShopifyBindings(internalApi, analytics)

    expect(analytics.subscribe).toHaveBeenCalledWith('page_viewed', jasmine.any(Function))
    expect(analytics.subscribe).toHaveBeenCalledWith('clicked', jasmine.any(Function))
    expect(analytics.subscribe).toHaveBeenCalledWith('ui_extension_errored', jasmine.any(Function))
  })

  it('maps "page_viewed" to a view event with the url, when the page is a checkout page', () => {
    const { internalApi, startEvent } = createFakeInternalApiForShopify()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(internalApi, analytics)
    emit('page_viewed', {
      name: 'page_viewed',
      id: '1',
      timestamp: '2026-07-06T00:00:00Z',
      context: { document: { title: 'Checkout', location: { href: 'https://shop.example/checkout' } } },
    })

    expect(startEvent).toHaveBeenCalledTimes(1)
    expect(startEvent.calls.argsFor(0)[0]).toEqual({ type: 'view', view: { url: 'https://shop.example/checkout' } })
  })

  describe('"page_viewed" checkout-path gating', () => {
    function emitPageViewed(url: string | undefined) {
      const { internalApi, startEvent } = createFakeInternalApiForShopify()
      const { analytics, emit } = createFakeAnalytics()

      initShopifyBindings(internalApi, analytics)
      emit('page_viewed', {
        name: 'page_viewed',
        id: '1',
        timestamp: '2026-07-06T00:00:00Z',
        context: { document: { title: 'Page', location: { href: url } } },
      })

      return startEvent
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

  it('starts a new view on each checkout page view (supersede is owned by the internal API)', () => {
    const { internalApi, startEvent } = createFakeInternalApiForShopify()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(internalApi, analytics)
    emit('page_viewed', {
      name: 'page_viewed',
      id: '1',
      timestamp: '2026-07-06T00:00:00Z',
      context: { document: { location: { href: 'https://shop.example/checkouts/first' } } },
    })
    emit('page_viewed', {
      name: 'page_viewed',
      id: '2',
      timestamp: '2026-07-06T00:00:01Z',
      context: { document: { location: { href: 'https://shop.example/checkouts/second' } } },
    })

    // Each page view starts a view; the previous one is superseded by the internal API (endings
    // are API-owned), and the initial version is emitted by the API — no handle calls at all.
    expect(startEvent).toHaveBeenCalledTimes(2)
    const urls = startEvent.calls.all().map((call) => (call.args[0] as { view: { url: string } }).view.url)
    expect(urls).toEqual(['https://shop.example/checkouts/first', 'https://shop.example/checkouts/second'])
  })

  it('maps "clicked" to a one-shot click action named after the element id', () => {
    const { internalApi, addEvent } = createFakeInternalApiForShopify()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(internalApi, analytics)
    emit('clicked', {
      name: 'clicked',
      id: '11',
      timestamp: '2026-07-06T00:00:00Z',
      data: { element: { id: 'add-to-cart-button', value: undefined, href: undefined } },
    })

    expect(addEvent).toHaveBeenCalledTimes(1)
    expect((addEvent.calls.argsFor(0)[0] as { baseRumEvent: unknown }).baseRumEvent).toEqual({
      type: 'action',
      action: { type: 'click', target: { name: 'add-to-cart-button' } },
    })
  })

  it('reports "clicked" when the element has no id', () => {
    const { internalApi, addEvent } = createFakeInternalApiForShopify()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(internalApi, analytics)
    emit('clicked', {
      name: 'clicked',
      id: '12',
      timestamp: '2026-07-06T00:00:00Z',
      data: { element: {} },
    })

    expect((addEvent.calls.argsFor(0)[0] as { baseRumEvent: unknown }).baseRumEvent).toEqual({
      type: 'action',
      action: { type: 'click', target: { name: 'element-without-id' } },
    })
  })

  it('maps "ui_extension_errored" to an error event with the flattened extension context', () => {
    const { internalApi, addEvent } = createFakeInternalApiForShopify()
    const { analytics, emit } = createFakeAnalytics()

    initShopifyBindings(internalApi, analytics)
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
          appId: 'gid://shopify/App/1',
          appName: 'my-app',
          appVersion: '1.2.3',
        },
      },
    })

    expect(addEvent).toHaveBeenCalledTimes(1)
    const { baseRumEvent, baggage } = addEvent.calls.argsFor(0)[0] as {
      baseRumEvent: {
        type: string
        error: { message: string; source: string; stack: string }
        context: Record<string, string | undefined>
      }
      baggage: { domainContext: { error: unknown } }
    }
    expect(baseRumEvent.type).toBe('error')
    // The error is built through formatErrorEvent, so the raw stack goes through the same
    // tracekit parsing as the public addError() (the message and source come from the trace).
    expect(baseRumEvent.error).toEqual(jasmine.objectContaining({ message: 'Boom', source: 'custom' }))
    expect(baseRumEvent.error.stack).toBeDefined()
    expect(baseRumEvent.context).toEqual({
      extensionName: 'my-extension',
      extensionTarget: 'purchase.checkout.block.render',
      extensionErrorType: 'RUNTIME',
      appId: 'gid://shopify/App/1',
      appName: 'my-app',
      appVersion: '1.2.3',
    })
    expect(baggage.domainContext.error).toBeInstanceOf(Error)
  })
})
