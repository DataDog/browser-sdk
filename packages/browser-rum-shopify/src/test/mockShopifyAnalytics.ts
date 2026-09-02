import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from '../domain/shopifyAnalytics'

export function createFakeAnalytics() {
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

export function pageViewedEvent(url: string | undefined): ShopifyPixelEvent {
  return {
    name: 'page_viewed',
    id: '1',
    timestamp: '2026-07-06T00:00:00Z',
    context: { document: { location: { href: url } } },
  }
}
