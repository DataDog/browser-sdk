import { replaceMockableWithSpy } from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { patchSandboxedIframeApis } from '../boot/patchSandboxedIframeApis'
import type { ShopifyAnalyticsApi } from './shopifyAnalytics'
import { initShopifyBindings } from './shopifyBindings'
import { shopifyPlugin } from './shopifyPlugin'

function createFakeAnalytics(): ShopifyAnalyticsApi {
  return { subscribe: jasmine.createSpy('subscribe') }
}

describe('shopifyPlugin', () => {
  describe('when `shopifyAnalytics` is provided (Custom Pixel sandbox)', () => {
    it('patches sandboxed iframe APIs and wires Shopify bindings', () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const analytics = createFakeAnalytics()
      const initConfiguration = { clientToken: 'token', applicationId: 'app-id' } as RumInitConfiguration

      shopifyPlugin({ shopifyAnalytics: analytics }).onInit!({ initConfiguration, publicApi })

      expect(patchSpy).toHaveBeenCalled()
      expect(initBindingsSpy).toHaveBeenCalledWith(publicApi, analytics)
    })

    it('forces sandbox-specific defaults, overriding customer values', () => {
      replaceMockableWithSpy(patchSandboxedIframeApis)
      replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const initConfiguration = { trackViewsManually: false } as unknown as RumInitConfiguration

      shopifyPlugin({ shopifyAnalytics: createFakeAnalytics() }).onInit!({ initConfiguration, publicApi })

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
  })

  describe('when `shopifyAnalytics` is absent (storefront)', () => {
    it('does not patch iframe APIs, wire bindings, or mutate the init configuration', () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const publicApi = {} as RumPublicApi
      const initConfiguration = { trackViewsManually: false } as unknown as RumInitConfiguration

      shopifyPlugin({}).onInit!({ initConfiguration, publicApi })

      expect(patchSpy).not.toHaveBeenCalled()
      expect(initBindingsSpy).not.toHaveBeenCalled()
      expect(initConfiguration).toEqual({ trackViewsManually: false } as unknown as RumInitConfiguration)
    })
  })
})
