import { createBatch, display, Observable, startSessionManager } from '@datadog/browser-core'
import type { Batch, Context, SessionManager } from '@datadog/browser-core'
import { mockClock, replaceMockable, waitNextMicrotask } from '@datadog/browser-core/test'
import { createFakeAnalytics, pageViewedEvent } from '../../test/mockShopifyAnalytics'
import type { ShopifyPixelEvent } from '../domain/shopifyAnalytics'
import type { WebPixelRumInitConfiguration } from './startWebPixelRum'
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

describe('startWebPixelRum', () => {
  function setup({ isSessionTracked = true } = {}) {
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
    } as unknown as SessionManager
    replaceMockable(startSessionManager, () => Promise.resolve(sessionManager))

    const { analytics, emit } = createFakeAnalytics()
    const browser = { cookie: { get: () => Promise.resolve(''), set: () => Promise.resolve('') } }
    const api = startWebPixelRum(INIT_CONFIGURATION, { analytics, browser })

    // Events are processed once the session manager is ready
    const emitAndWait = async (name: string, event: ShopifyPixelEvent) => {
      emit(name, event)
      for (let i = 0; i < 5; i += 1) {
        await waitNextMicrotask()
      }
    }

    return { api, analytics, batch, clock, emitAndWait }
  }

  function viewUpdates(batch: { upsert: jasmine.Spy }) {
    return batch.upsert.calls.allArgs().map(([event]) => event as Context & { view: Context; _dd: Context })
  }

  it('does not start without an application id', () => {
    const displayErrorSpy = spyOn(display, 'error')
    const { analytics } = createFakeAnalytics()
    const browser = { cookie: { get: () => Promise.resolve(''), set: () => Promise.resolve('') } }

    const api = startWebPixelRum({ clientToken: 'client-token' } as WebPixelRumInitConfiguration, {
      analytics,
      browser,
    })

    expect(api).toBeUndefined()
    expect(analytics.subscribe).not.toHaveBeenCalled()
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
})
