import { TIMEOUT_ERROR_MESSAGE } from '@datadog/browser-core'
import { mockClock, replaceMockableWithSpy } from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { patchSandboxedIframeApis } from '../boot/patchSandboxedIframeApis'
import { createFakeAnalytics, pageViewedEvent } from '../../test/mockShopifyAnalytics'
import type { ShopifyAnalyticsApi } from './shopifyAnalytics'
import { initShopifyBindings } from './shopifyBindings'
import { shopifyPlugin } from './shopifyPlugin'

describe('shopifyPlugin', () => {
  describe('when `shopifyAnalytics` is provided (Custom Pixel sandbox)', () => {
    it('does not patch or wire bindings until a checkout `page_viewed` event fires', () => {
      mockClock()
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const { analytics } = createFakeAnalytics()
      const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration

      void shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })

      expect(patchSpy).not.toHaveBeenCalled()
      expect(initBindingsSpy).not.toHaveBeenCalled()
    })

    it('patches sandboxed iframe APIs and wires Shopify bindings once a checkout page is viewed', async () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const { analytics, emit } = createFakeAnalytics()
      const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration

      const result = shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })
      emit('page_viewed', pageViewedEvent('https://shop.example/checkout'))
      await result

      expect(patchSpy).toHaveBeenCalled()
      expect(initBindingsSpy).toHaveBeenCalledWith(publicApi, analytics)
    })

    it('forces sandbox-specific defaults, overriding customer values, once a checkout page is viewed', async () => {
      replaceMockableWithSpy(patchSandboxedIframeApis)
      replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const { analytics, emit } = createFakeAnalytics()
      const initConfiguration = { trackViewsManually: false } as unknown as RumInitConfiguration

      const result = shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })
      emit('page_viewed', pageViewedEvent('https://shop.example/checkout'))
      await result

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

    it('installs bindings only once, ignoring subsequent `page_viewed` events', async () => {
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      replaceMockableWithSpy(patchSandboxedIframeApis)
      const publicApi = {} as RumPublicApi
      const { analytics, emit } = createFakeAnalytics()
      const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration

      const result = shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })
      emit('page_viewed', pageViewedEvent('https://shop.example/checkout'))
      emit('page_viewed', pageViewedEvent('https://shop.example/checkout'))
      await result

      expect(initBindingsSpy).toHaveBeenCalledTimes(1)
    })

    it('rejects if no page_viewed event fires before the timeout', async () => {
      const clock = mockClock()
      const publicApi = {} as RumPublicApi
      const { analytics } = createFakeAnalytics()
      const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration

      const result = shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })
      clock.tick(1_000)

      await expectAsync(result).toBeRejectedWithError(TIMEOUT_ERROR_MESSAGE)
    })
  })

  describe('when `shopifyAnalytics` is absent (storefront)', () => {
    it('does not patch iframe APIs, wire bindings, or mutate the init configuration', async () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const initConfiguration = { trackViewsManually: false } as unknown as RumInitConfiguration

      const result = shopifyPlugin({ shopifyAnalytics: undefined as unknown as ShopifyAnalyticsApi }).onInit!({
        initConfiguration,
        publicApi,
      })

      await expectAsync(result).toBeResolvedTo(false)
      expect(patchSpy).not.toHaveBeenCalled()
      expect(initBindingsSpy).not.toHaveBeenCalled()
      expect(initConfiguration).toEqual({ trackViewsManually: false } as unknown as RumInitConfiguration)
    })
  })
})
