import type { Context } from '@datadog/js-core/util'
import { createBatch, display, Observable, startSessionManager } from '@datadog/browser-core'
import type { Batch, SessionManager, TrackingConsentState } from '@datadog/browser-core'
import { mockClock, replaceMockable, waitNextMicrotask } from '@datadog/browser-core/test'
import { createFakeAnalytics, pageViewedEvent } from '../../test/mockShopifyAnalytics'
import type { ShopifyPixelEvent } from '../domain/shopifyAnalytics'
import type { WebPixelApi, WebPixelRumInitConfiguration } from './startWebPixelRum'
import { startWebPixelRum } from './startWebPixelRum'

const CHECKOUT_URL = 'https://shop.example/checkouts/cn/abc'
const THANK_YOU_URL = 'https://shop.example/checkouts/cn/abc/thank-you'
const INIT_CONFIGURATION: WebPixelRumInitConfiguration = {
  applicationId: 'application-id',
  clientToken: 'client-token',
  service: 'shop',
}

function checkoutEvent<TData>(name: string, data: TData): ShopifyPixelEvent<TData> {
  return { ...pageViewedEvent(CHECKOUT_URL), name, data }
}

function createFakeWebPixelApi({ analyticsProcessingAllowed = true } = {}) {
  const { analytics, emit } = createFakeAnalytics()
  let notifyConsent: ((event: { customerPrivacy: { analyticsProcessingAllowed: boolean } }) => void) | undefined
  const api: WebPixelApi = {
    analytics,
    browser: { cookie: { get: () => Promise.resolve(''), set: () => Promise.resolve('') } },
    init: { customerPrivacy: { analyticsProcessingAllowed } },
    customerPrivacy: {
      subscribe: (_eventName, callback) => {
        notifyConsent = callback
      },
    },
  }
  return {
    api,
    emit,
    setConsent: (allowed: boolean) => notifyConsent?.({ customerPrivacy: { analyticsProcessingAllowed: allowed } }),
  }
}

describe('startWebPixelRum', () => {
  function setup({
    isSessionTracked = true,
    analyticsProcessingAllowed = true,
    initConfiguration = INIT_CONFIGURATION,
  }: {
    isSessionTracked?: boolean
    analyticsProcessingAllowed?: boolean
    initConfiguration?: WebPixelRumInitConfiguration
  } = {}) {
    const clock = mockClock()
    const batch = {
      add: jasmine.createSpy<(event: Context) => void>('add'),
      upsert: jasmine.createSpy<(event: Context, key: string) => void>('upsert'),
      forceFlush: jasmine.createSpy('forceFlush'),
    }
    replaceMockable(createBatch, () => batch as unknown as Batch)
    const sessionManager = {
      findTrackedSession: () => (isSessionTracked ? { id: 'session-id', anonymousId: 'anonymous-id' } : undefined),
      expireObservable: new Observable<void>(),
      renewObservable: new Observable<void>(),
      expandOrRenew: jasmine.createSpy('expandOrRenew'),
    }
    const startSessionManagerSpy = jasmine
      .createSpy('startSessionManager')
      .and.returnValue(Promise.resolve(sessionManager as unknown as SessionManager))
    replaceMockable(startSessionManager, startSessionManagerSpy)

    const { api: webPixelApi, emit, setConsent } = createFakeWebPixelApi({ analyticsProcessingAllowed })
    const api = startWebPixelRum(initConfiguration, webPixelApi)

    // Events are processed once the session manager is ready
    const flush = async () => {
      for (let i = 0; i < 5; i += 1) {
        await waitNextMicrotask()
      }
    }
    const emitAndWait = async (name: string, event: ShopifyPixelEvent) => {
      emit(name, event)
      await flush()
    }

    return { api, batch, clock, emitAndWait, flush, sessionManager, setConsent, startSessionManagerSpy }
  }

  function viewUpdates(batch: { upsert: jasmine.Spy }) {
    return batch.upsert.calls.allArgs().map(([event]) => event as Context & { view: Context; _dd: Context })
  }

  it('does not start without an application id', () => {
    const displayErrorSpy = spyOn(display, 'error')
    const { api: webPixelApi } = createFakeWebPixelApi()

    const api = startWebPixelRum({ clientToken: 'client-token' } as WebPixelRumInitConfiguration, webPixelApi)

    expect(api).toBeUndefined()
    expect(webPixelApi.analytics.subscribe).not.toHaveBeenCalled()
    expect(displayErrorSpy).toHaveBeenCalled()
  })

  it('starts a view attached to the shared session when a checkout page is viewed', async () => {
    const { batch, emitAndWait } = setup()

    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))

    expect(batch.upsert).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'view',
        application: { id: 'application-id' },
        session: { id: 'session-id', type: 'user' },
        usr: { anonymous_id: 'anonymous-id' },
        service: 'shop',
        view: jasmine.objectContaining({ url: CHECKOUT_URL, loading_type: 'initial_load', is_active: true }),
        _dd: jasmine.objectContaining({ format_version: 2, document_version: 1 }),
      }),
      jasmine.any(String)
    )
  })

  it('does not start the session on storefront pages', async () => {
    const { emitAndWait, startSessionManagerSpy } = setup()

    await emitAndWait('page_viewed', pageViewedEvent('https://shop.example/products/foo'))
    await emitAndWait('checkout_started', checkoutEvent('checkout_started', {}))

    expect(startSessionManagerSpy).not.toHaveBeenCalled()
  })

  it('starts the session once, on the first checkout page view', async () => {
    const { emitAndWait, startSessionManagerSpy } = setup()

    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))
    await emitAndWait('page_viewed', pageViewedEvent(THANK_YOU_URL))

    expect(startSessionManagerSpy).toHaveBeenCalledTimes(1)
  })

  it('expands the session on each Shopify event', async () => {
    const { emitAndWait, sessionManager } = setup()

    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))
    await emitAndWait('clicked', checkoutEvent('clicked', { element: { id: 'continue' } }))

    expect(sessionManager.expandOrRenew).toHaveBeenCalledTimes(2)
  })

  it('ends the view when the session expires and starts a new one when it is renewed', async () => {
    const { batch, emitAndWait, sessionManager } = setup()
    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))

    sessionManager.expireObservable.notify()
    sessionManager.renewObservable.notify()

    const [first, firstEnd, renewed] = viewUpdates(batch)
    expect(firstEnd.view).toEqual(jasmine.objectContaining({ id: first.view.id, is_active: false }))
    expect(renewed.view).toEqual(jasmine.objectContaining({ url: CHECKOUT_URL, is_active: true }))
    expect(renewed.view.id).not.toBe(first.view.id)
    expect(batch.forceFlush).toHaveBeenCalledWith('session_expire')
  })

  it('ignores pages outside of the checkout', async () => {
    const { batch, emitAndWait } = setup()

    await emitAndWait('page_viewed', pageViewedEvent('https://shop.example/products/foo'))

    expect(batch.upsert).not.toHaveBeenCalled()
  })

  it('collects checkout events as custom actions without personal data', async () => {
    const { batch, emitAndWait } = setup()
    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))

    await emitAndWait(
      'checkout_started',
      checkoutEvent('checkout_started', {
        checkout: { token: 'token', currencyCode: 'EUR', totalPrice: { amount: 10 }, email: 'buyer@example.com' },
      })
    )

    const action = batch.add.calls.mostRecent().args[0]
    expect(action).toEqual(
      jasmine.objectContaining({
        type: 'action',
        action: jasmine.objectContaining({ type: 'custom', target: { name: 'checkout_started' } }),
        context: { checkout: { token: 'token', currency: 'EUR', total_price: 10, order_id: undefined } },
        view: jasmine.objectContaining({ id: viewUpdates(batch)[0].view.id }),
      })
    )
    expect(JSON.stringify(action)).not.toContain('buyer@example.com')
  })

  it('collects clicks as click actions', async () => {
    const { batch, emitAndWait } = setup()
    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))

    await emitAndWait('clicked', checkoutEvent('clicked', { element: { id: 'continue' } }))

    expect(batch.add).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ action: jasmine.objectContaining({ type: 'click', target: { name: 'continue' } }) })
    )
  })

  it('collects checkout UI extension errors', async () => {
    const { batch, emitAndWait } = setup()
    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))

    await emitAndWait(
      'ui_extension_errored',
      checkoutEvent('ui_extension_errored', { error: { message: 'boom', trace: 'Error: boom', appName: 'Upsell' } })
    )

    expect(batch.add).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        type: 'error',
        error: jasmine.objectContaining({ message: 'boom', stack: 'Error: boom', source: 'custom' }),
        context: { extension: { appName: 'Upsell' } },
      })
    )
  })

  it('sends custom actions and errors through the returned API', async () => {
    const { api, batch, emitAndWait } = setup()
    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))

    api!.addAction('coupon_applied', { code: 'SAVE10' })
    api!.addError('payment failed')
    await emitAndWait('noop', pageViewedEvent(CHECKOUT_URL))

    expect(batch.add.calls.allArgs().map(([event]) => event.type)).toEqual(['action', 'error'])
  })

  it('updates the view counters after an action', async () => {
    const { batch, clock, emitAndWait } = setup()
    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))
    await emitAndWait('clicked', checkoutEvent('clicked', { element: { id: 'continue' } }))

    clock.tick(3000)

    const lastUpdate = viewUpdates(batch).pop()!
    expect(lastUpdate._dd).toEqual(jasmine.objectContaining({ document_version: 2 }))
    expect(lastUpdate.view).toEqual(jasmine.objectContaining({ action: { count: 1 } }))
  })

  it('ends the current view and starts a new one when another checkout page is viewed', async () => {
    const { batch, emitAndWait } = setup()

    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))
    await emitAndWait('page_viewed', pageViewedEvent(THANK_YOU_URL))

    const [first, firstEnd, second] = viewUpdates(batch)
    expect(firstEnd.view).toEqual(jasmine.objectContaining({ id: first.view.id, is_active: false }))
    expect(second.view).toEqual(
      jasmine.objectContaining({ url: THANK_YOU_URL, referrer: CHECKOUT_URL, loading_type: 'route_change' })
    )
    expect(second.view.id).not.toBe(first.view.id)
  })

  it('does not send events when the session is not tracked', async () => {
    const { batch, emitAndWait } = setup({ isSessionTracked: false })

    await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))
    await emitAndWait('clicked', checkoutEvent('clicked', { element: { id: 'continue' } }))

    expect(batch.upsert).not.toHaveBeenCalled()
    expect(batch.add).not.toHaveBeenCalled()
  })

  describe('customer privacy', () => {
    it('does not start the session before the visitor consents to analytics', async () => {
      const { batch, emitAndWait, startSessionManagerSpy } = setup({ analyticsProcessingAllowed: false })

      await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))

      expect(startSessionManagerSpy).not.toHaveBeenCalled()
      expect(batch.upsert).not.toHaveBeenCalled()
    })

    it('collects the events received before consent once the visitor consents', async () => {
      const { batch, emitAndWait, flush, setConsent } = setup({ analyticsProcessingAllowed: false })
      await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))

      setConsent(true)
      await flush()

      expect(batch.upsert).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({ view: jasmine.objectContaining({ url: CHECKOUT_URL }) }),
        jasmine.any(String)
      )
    })

    it('forwards consent changes to the session manager', async () => {
      const { emitAndWait, setConsent, startSessionManagerSpy } = setup()
      await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))
      const trackingConsentState = startSessionManagerSpy.calls.mostRecent().args[1] as TrackingConsentState

      setConsent(false)

      expect(trackingConsentState.isGranted()).toBeFalse()
    })

    it('collects without consent when bypassing customer privacy', async () => {
      const { batch, emitAndWait } = setup({
        analyticsProcessingAllowed: false,
        initConfiguration: { ...INIT_CONFIGURATION, bypassCustomerPrivacy: true },
      })

      await emitAndWait('page_viewed', pageViewedEvent(CHECKOUT_URL))

      expect(batch.upsert).toHaveBeenCalledTimes(1)
    })
  })
})
