import { TIMEOUT_ERROR_MESSAGE } from '@datadog/browser-core'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from './shopifyAnalytics'
import { waitForPageViewedEvent } from './shopifyAnalytics'

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

function pageViewedEvent(url: string | undefined): ShopifyPixelEvent {
  return {
    name: 'page_viewed',
    id: '1',
    timestamp: '2026-07-06T00:00:00Z',
    context: { document: { location: { href: url } } },
  }
}

describe('waitForPageViewedEvent', () => {
  it('resolves with the page_viewed event once it is emitted', async () => {
    const { analytics, emit } = createFakeAnalytics()
    const event = pageViewedEvent('https://shop.example/checkout')

    const result = waitForPageViewedEvent(analytics)
    emit('page_viewed', event)

    await expectAsync(result).toBeResolvedTo(event)
  })

  it('rejects with a timeout error if no page_viewed event fires before the timeout', async () => {
    const { analytics } = createFakeAnalytics()

    await expectAsync(waitForPageViewedEvent(analytics, { timeout: 0 })).toBeRejectedWithError(TIMEOUT_ERROR_MESSAGE)
  })

  it('resolves rather than timing out if the page_viewed event fires before the timeout elapses', async () => {
    const { analytics, emit } = createFakeAnalytics()
    const event = pageViewedEvent('https://shop.example/checkout')

    const result = waitForPageViewedEvent(analytics, { timeout: 1000 })
    emit('page_viewed', event)

    await expectAsync(result).toBeResolvedTo(event)
  })
})
