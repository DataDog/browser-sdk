import { replaceMockableWithSpy } from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { patchSandboxedIframeApis } from '../boot/patchSandboxedIframeApis'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from './shopifyAnalytics'
import { initShopifyBindings } from './shopifyBindings'
import { shopifyPlugin } from './shopifyPlugin'

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

describe('shopifyPlugin', () => {
  describe('when `shopifyAnalytics` is provided (Custom Pixel sandbox)', () => {
    it('does not patch or wire bindings until a checkout `page_viewed` event fires', () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const { analytics } = createFakeAnalytics()
      const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration

      void shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })

      expect(patchSpy).not.toHaveBeenCalled()
      expect(initBindingsSpy).not.toHaveBeenCalled()
    })

    it('patches sandboxed iframe APIs and wires Shopify bindings once a checkout page is viewed', () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const { analytics, emit } = createFakeAnalytics()
      const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration

      void shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })
      emit('page_viewed', pageViewedEvent('https://shop.example/checkout'))

      expect(patchSpy).toHaveBeenCalled()
      expect(initBindingsSpy).toHaveBeenCalledWith(publicApi, analytics)
    })

    it('forces sandbox-specific defaults, overriding customer values, once a checkout page is viewed', () => {
      replaceMockableWithSpy(patchSandboxedIframeApis)
      replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const { analytics, emit } = createFakeAnalytics()
      const initConfiguration = { trackViewsManually: false } as unknown as RumInitConfiguration

      void shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })
      emit('page_viewed', pageViewedEvent('https://shop.example/checkout'))

      expect(initConfiguration).toEqual(
        jasmine.objectContaining({
          trackViewsManually: true,
          sessionReplaySampleRate: 0,
          profilingSampleRate: 0,
          trackUserInteractions: false,
          trackResources: false,
          trackLongTasks: false,
          sessionPersistence: 'cookie',
        })
      )
    })

    it('does not patch or wire bindings when the first viewed page is not a checkout page', async () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const { analytics, emit } = createFakeAnalytics()
      const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration

      const result = shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })
      emit('page_viewed', pageViewedEvent('https://shop.example/products/foo'))

      expect(patchSpy).not.toHaveBeenCalled()
      expect(initBindingsSpy).not.toHaveBeenCalled()
      await expectAsync(result).toBeResolvedTo(false)
    })

    it('installs bindings only once, ignoring subsequent `page_viewed` events', () => {
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      replaceMockableWithSpy(patchSandboxedIframeApis)
      const publicApi = {} as RumPublicApi
      const { analytics, emit } = createFakeAnalytics()
      const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration

      void shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })
      emit('page_viewed', pageViewedEvent('https://shop.example/checkout'))
      emit('page_viewed', pageViewedEvent('https://shop.example/checkout'))

      expect(initBindingsSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('when `shopifyAnalytics` is absent (storefront)', () => {
    it('does not patch iframe APIs, wire bindings, or mutate the init configuration', () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const initConfiguration = { trackViewsManually: false } as unknown as RumInitConfiguration

      // @ts-expect-error - shopifyAnalytics is required
      const result = shopifyPlugin({}).onInit!({ initConfiguration, publicApi })

      expect(result).toBe(false)
      expect(patchSpy).not.toHaveBeenCalled()
      expect(initBindingsSpy).not.toHaveBeenCalled()
      expect(initConfiguration).toEqual({ trackViewsManually: false } as unknown as RumInitConfiguration)
    })
  })
})
