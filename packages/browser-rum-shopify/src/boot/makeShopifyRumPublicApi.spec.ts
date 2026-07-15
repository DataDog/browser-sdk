import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { makeShopifyRumPublicApi } from './makeShopifyRumPublicApi'

describe('makeShopifyRumPublicApi', () => {
  it('forces trackViewsManually to true, overriding the customer value', () => {
    const initSpy = jasmine.createSpy('init')
    const datadogRum = { init: initSpy, addAction: jasmine.createSpy() } as unknown as RumPublicApi

    const shopifyRum = makeShopifyRumPublicApi(datadogRum, 'https://shop.example/checkout')
    shopifyRum.init({ trackViewsManually: false } as RumInitConfiguration)

    expect(initSpy).toHaveBeenCalledWith(jasmine.objectContaining({ trackViewsManually: true }))
  })

  it('forwards other init options unchanged', () => {
    const initSpy = jasmine.createSpy('init')
    const datadogRum = { init: initSpy } as unknown as RumPublicApi

    const shopifyRum = makeShopifyRumPublicApi(datadogRum, 'https://shop.example/checkout')
    shopifyRum.init({ applicationId: 'app-id', clientToken: 'token' })

    expect(initSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ applicationId: 'app-id', clientToken: 'token' })
    )
  })

  it('exposes the wrapped instance methods unchanged', () => {
    const addActionSpy = jasmine.createSpy('addAction')
    const datadogRum = { init: jasmine.createSpy(), addAction: addActionSpy } as unknown as RumPublicApi

    const shopifyRum = makeShopifyRumPublicApi(datadogRum, 'https://shop.example/checkout')
    shopifyRum.addAction('foo')

    expect(addActionSpy).toHaveBeenCalledWith('foo')
  })

  describe('checkout-path gating', () => {
    it('does not init on storefront pages', () => {
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum, 'https://shop.example/products/foo')
      shopifyRum.init({ applicationId: 'app-id', clientToken: 'token' })

      expect(initSpy).not.toHaveBeenCalled()
    })

    it('inits on /checkout and /checkouts/* pages', () => {
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      makeShopifyRumPublicApi(datadogRum, 'https://shop.example/checkout').init({} as RumInitConfiguration)
      makeShopifyRumPublicApi(datadogRum, 'https://shop.example/checkouts/abc123').init({} as RumInitConfiguration)

      expect(initSpy).toHaveBeenCalledTimes(2)
    })

    it('does not init on /orders/* pages (Order Status)', () => {
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum, 'https://shop.example/orders/abc123')
      shopifyRum.init({} as RumInitConfiguration)

      expect(initSpy).not.toHaveBeenCalled()
    })

    it('does not init on Customer Account pages', () => {
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum, 'https://shop.example/account/orders')
      shopifyRum.init({} as RumInitConfiguration)

      expect(initSpy).not.toHaveBeenCalled()
    })

    it('inits on locale-prefixed checkout paths', () => {
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum, 'https://shop.example/en-us/checkout')
      shopifyRum.init({} as RumInitConfiguration)

      expect(initSpy).toHaveBeenCalledTimes(1)
    })

    it('does not init when the url is undefined', () => {
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum, undefined)
      shopifyRum.init({} as RumInitConfiguration)

      expect(initSpy).not.toHaveBeenCalled()
    })
  })
})
