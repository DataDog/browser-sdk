import type { ExtensionApi } from '@shopify/web-pixels-extension'
import type { RumInitConfiguration, RumPluginOnInitOptions, RumPublicApi } from '@datadog/browser-rum-core'
import { createFakeAnalytics, pageViewedEvent } from '../../test/mockShopifyAnalytics'
import type { ShopifyAnalyticsApi } from './shopifyAnalytics'
import { shopifyAppPixelPlugin } from './shopifyAppPixelPlugin'

const CHECKOUT_URL = 'https://shop.example/checkouts/cn/abc/information'

function setup(settings: Record<string, unknown> = {}) {
  const { analytics, emit } = createFakeAnalytics()
  const publicApi = jasmine.createSpyObj<RumPublicApi>('publicApi', ['addAction', 'startView'])
  const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration
  const registerAssembleEventHook =
    jasmine.createSpy<RumPluginOnInitOptions['registerAssembleEventHook']>('registerAssembleEventHook')
  const init = {
    context: {
      window: { innerWidth: 1280, innerHeight: 800 },
      document: { referrer: 'https://shop.example/cart' },
    },
  }
  const onInitResult = shopifyAppPixelPlugin({ analytics, init, settings } as unknown as ExtensionApi).onInit!({
    initConfiguration,
    publicApi,
    registerAssembleEventHook,
  })
  return { analytics, emit, publicApi, initConfiguration, onInitResult, registerAssembleEventHook }
}

describe('shopifyAppPixelPlugin', () => {
  it('aborts initialization when the first page viewed is not a checkout page', async () => {
    const { analytics, emit, onInitResult } = setup()

    emit('page_viewed', pageViewedEvent('https://shop.example/products/shirt'))

    expect(await onInitResult).toBeFalse()
    expect(analytics.subscribe).not.toHaveBeenCalledWith('checkout_started', jasmine.any(Function))
  })

  it('forces the worker configuration once a checkout page is viewed', async () => {
    const { emit, initConfiguration, onInitResult } = setup()

    emit('page_viewed', pageViewedEvent(CHECKOUT_URL))

    expect(await onInitResult).toBeUndefined()
    expect(initConfiguration).toEqual(
      jasmine.objectContaining({
        trackViewsManually: true,
        sessionPersistence: 'memory',
        trackUserInteractions: false,
        trackResources: false,
        trackLongTasks: false,
        sessionReplaySampleRate: 0,
        profilingSampleRate: 0,
      })
    )
  })

  it('collects checkout events as custom actions without personal data', async () => {
    const { emit, publicApi, onInitResult } = setup()
    emit('page_viewed', pageViewedEvent(CHECKOUT_URL))
    await onInitResult

    emit('checkout_completed', {
      ...pageViewedEvent(CHECKOUT_URL),
      name: 'checkout_completed',
      data: {
        checkout: {
          token: 'checkout-token',
          currencyCode: 'USD',
          totalPrice: { amount: 42, currencyCode: 'USD' },
          order: { id: 'order-id' },
          email: 'buyer@example.com',
          phone: '+1 555 0100',
        },
      },
    })

    expect(publicApi.addAction).toHaveBeenCalledOnceWith('checkout_completed', {
      checkout: { token: 'checkout-token', currencyCode: 'USD', totalPrice: 42, orderId: 'order-id' },
    })
  })

  it('collects displayed alerts as custom actions without the buyer input', async () => {
    const { emit, publicApi, onInitResult } = setup()
    emit('page_viewed', pageViewedEvent(CHECKOUT_URL))
    await onInitResult

    emit('alert_displayed', {
      ...pageViewedEvent(CHECKOUT_URL),
      name: 'alert_displayed',
      data: { alert: { type: 'INPUT_INVALID', target: 'email', message: 'Enter a valid email', value: 'buyer@' } },
    })

    expect(publicApi.addAction).toHaveBeenCalledOnceWith('alert_displayed', {
      alert: { type: 'INPUT_INVALID', target: 'email', message: 'Enter a valid email' },
    })
  })

  describe('trackedEvents setting', () => {
    it('collects the default events when the setting is not set', async () => {
      const { analytics, emit, onInitResult } = setup()
      emit('page_viewed', pageViewedEvent(CHECKOUT_URL))
      await onInitResult

      expect(analytics.subscribe).toHaveBeenCalledWith('checkout_completed', jasmine.any(Function))
      expect(analytics.subscribe).not.toHaveBeenCalledWith('input_changed', jasmine.any(Function))
    })

    it('collects the default events when the setting is blank', async () => {
      const { analytics, emit, onInitResult } = setup({ trackedEvents: ' ' })
      emit('page_viewed', pageViewedEvent(CHECKOUT_URL))
      await onInitResult

      expect(analytics.subscribe).toHaveBeenCalledWith('checkout_completed', jasmine.any(Function))
    })

    it('only collects the always tracked events when the setting is none', async () => {
      const { analytics, emit, onInitResult } = setup({ trackedEvents: 'none' })
      emit('page_viewed', pageViewedEvent(CHECKOUT_URL))
      await onInitResult

      expect(analytics.subscribe).not.toHaveBeenCalledWith('checkout_completed', jasmine.any(Function))
      expect(analytics.subscribe).toHaveBeenCalledWith('ui_extension_errored', jasmine.any(Function))
    })

    it('only collects the listed events, plus the always tracked ones', async () => {
      const { analytics, emit, onInitResult } = setup({ trackedEvents: 'input_changed, checkout_completed' })
      emit('page_viewed', pageViewedEvent(CHECKOUT_URL))
      await onInitResult

      const subscribedEvents = (analytics.subscribe as jasmine.Spy<ShopifyAnalyticsApi['subscribe']>).calls
        .allArgs()
        .map(([eventName]) => eventName)
      // The first subscription is the initial `page_viewed` wait, `all_events` keeps the viewport
      expect(subscribedEvents.slice(1).sort()).toEqual([
        'all_events',
        'checkout_completed',
        'input_changed',
        'page_viewed',
        'ui_extension_errored',
      ])
    })

    it('collects input events without the buyer input', async () => {
      const { emit, publicApi, onInitResult } = setup({ trackedEvents: 'input_changed' })
      emit('page_viewed', pageViewedEvent(CHECKOUT_URL))
      await onInitResult

      emit('input_changed', {
        ...pageViewedEvent(CHECKOUT_URL),
        name: 'input_changed',
        data: { element: { id: 'email', name: 'email', type: 'email', tagName: 'INPUT', value: 'buyer@example.com' } },
      })

      expect(publicApi.addAction).toHaveBeenCalledOnceWith('input_changed', {
        element: { id: 'email', name: 'email', type: 'email', tagName: 'INPUT' },
      })
    })
  })

  it('adds the checkout viewport from the latest Shopify event', async () => {
    const { emit, onInitResult, registerAssembleEventHook } = setup()
    emit('page_viewed', pageViewedEvent(CHECKOUT_URL))
    await onInitResult
    const assembleHook = registerAssembleEventHook.calls.argsFor(0)[0]
    type AssembleHookParams = Parameters<typeof assembleHook>[0]

    expect(assembleHook({ eventType: 'view' } as AssembleHookParams)).toEqual({
      type: 'view',
      display: { viewport: { width: 1280, height: 800 } },
    })

    emit('all_events', { ...pageViewedEvent(CHECKOUT_URL), context: { window: { innerWidth: 390, innerHeight: 844 } } })

    expect(assembleHook({ eventType: 'action' } as AssembleHookParams)).toEqual({
      type: 'action',
      display: { viewport: { width: 390, height: 844 } },
    })
  })

  it('adds the checkout referrer to the events of the first view only', async () => {
    const { emit, onInitResult, registerAssembleEventHook } = setup()
    emit('page_viewed', pageViewedEvent(CHECKOUT_URL))
    await onInitResult
    const assembleHook = registerAssembleEventHook.calls.argsFor(1)[0]
    type AssembleHookParams = Parameters<typeof assembleHook>[0]
    const viewEvent = (startTime: number) => ({ eventType: 'view', startTime }) as AssembleHookParams
    const actionEvent = (startTime: number) => ({ eventType: 'action', startTime }) as AssembleHookParams

    expect(assembleHook(viewEvent(0))).toEqual({
      type: 'view',
      view: { referrer: 'https://shop.example/cart' },
    })
    expect(assembleHook(actionEvent(10))).toEqual({ type: 'action', view: { referrer: 'https://shop.example/cart' } })

    expect(assembleHook(viewEvent(100))).toBe('SKIPPED')
    expect(assembleHook(actionEvent(110))).toBe('SKIPPED')
    // Late updates of the first view keep its referrer
    expect(assembleHook(viewEvent(0))).toEqual({
      type: 'view',
      view: { referrer: 'https://shop.example/cart' },
    })
  })
})
