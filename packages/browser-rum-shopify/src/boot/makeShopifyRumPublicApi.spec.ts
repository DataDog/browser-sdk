import { replaceMockableWithSpy } from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi } from '../domain/shopifyAnalytics'
import { initShopifyBindings } from '../domain/shopifyBindings'
import { patchSandboxedIframeApis } from './patchSandboxedIframeApis'
import { makeShopifyRumPublicApi } from './makeShopifyRumPublicApi'

function createFakeAnalytics(): ShopifyAnalyticsApi {
  return { subscribe: jasmine.createSpy('subscribe') }
}

describe('makeShopifyRumPublicApi', () => {
  describe('when `shopifyAnalytics` is provided in the init configuration (Custom Pixel sandbox)', () => {
    it('patches sandboxed iframe APIs and wires Shopify bindings', () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const datadogRum = { init: jasmine.createSpy('init') } as unknown as RumPublicApi
      const analytics = createFakeAnalytics()

      const shopifyRum = makeShopifyRumPublicApi(datadogRum)
      shopifyRum.init({
        clientToken: 'token',
        applicationId: 'app-id',
        shopifyAnalytics: analytics,
      } as RumInitConfiguration)

      expect(patchSpy).toHaveBeenCalled()
      expect(initBindingsSpy).toHaveBeenCalledWith(datadogRum, analytics)
    })

    it('forces sandbox-specific defaults, overriding customer values', () => {
      replaceMockableWithSpy(patchSandboxedIframeApis)
      replaceMockableWithSpy(initShopifyBindings)
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum)
      shopifyRum.init({
        trackViewsManually: false,
        shopifyAnalytics: createFakeAnalytics(),
      } as unknown as RumInitConfiguration)

      expect(initSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({
          trackViewsManually: true,
          sessionReplaySampleRate: 0,
          trackUserInteractions: false,
          trackResources: false,
          trackLongTasks: false,
          sessionPersistence: 'cookie',
        })
      )
    })

    it('forwards other init options unchanged, without leaking `shopifyAnalytics`', () => {
      replaceMockableWithSpy(patchSandboxedIframeApis)
      replaceMockableWithSpy(initShopifyBindings)
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum)
      shopifyRum.init({
        applicationId: 'app-id',
        clientToken: 'token',
        shopifyAnalytics: createFakeAnalytics(),
      } as RumInitConfiguration)

      const forwarded = initSpy.calls.argsFor(0)[0] as Record<string, unknown>
      expect(forwarded).toEqual(jasmine.objectContaining({ applicationId: 'app-id', clientToken: 'token' }))
      expect(forwarded.shopifyAnalytics).toBeUndefined()
    })
  })

  describe('when `shopifyAnalytics` is absent from the init configuration (storefront)', () => {
    it('forwards init options unchanged, without patching or wiring bindings', () => {
      const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
      const initBindingsSpy = replaceMockableWithSpy(initShopifyBindings)
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum)
      shopifyRum.init({ trackViewsManually: false } as RumInitConfiguration)

      expect(initSpy).toHaveBeenCalledWith({ trackViewsManually: false })
      expect(patchSpy).not.toHaveBeenCalled()
      expect(initBindingsSpy).not.toHaveBeenCalled()
    })
  })

  describe('other instance methods', () => {
    it('exposes wrapped instance methods unchanged', () => {
      const addActionSpy = jasmine.createSpy('addAction')
      const datadogRum = { init: jasmine.createSpy(), addAction: addActionSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum)
      shopifyRum.addAction('foo')

      expect(addActionSpy).toHaveBeenCalledWith('foo')
    })
  })
})
