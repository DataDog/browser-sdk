import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { makeShopifyRumPublicApi } from './makeShopifyRumPublicApi'

describe('makeShopifyRumPublicApi', () => {
  describe('in the Custom Pixel sandbox', () => {
    it('forces trackViewsManually to true, overriding the customer value', () => {
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy, addAction: jasmine.createSpy() } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum, true)
      shopifyRum.init({ trackViewsManually: false } as RumInitConfiguration)

      expect(initSpy).toHaveBeenCalledWith(jasmine.objectContaining({ trackViewsManually: true }))
    })

    it('forwards other init options unchanged', () => {
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum, true)
      shopifyRum.init({ applicationId: 'app-id', clientToken: 'token' })

      expect(initSpy).toHaveBeenCalledWith(jasmine.objectContaining({ applicationId: 'app-id', clientToken: 'token' }))
    })

    it('exposes the wrapped instance methods unchanged', () => {
      const addActionSpy = jasmine.createSpy('addAction')
      const datadogRum = { init: jasmine.createSpy(), addAction: addActionSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum, true)
      shopifyRum.addAction('foo')

      expect(addActionSpy).toHaveBeenCalledWith('foo')
    })
  })

  describe('outside the Custom Pixel sandbox (storefront)', () => {
    it('returns the datadogRum instance unchanged', () => {
      const datadogRum = { init: jasmine.createSpy() } as unknown as RumPublicApi

      expect(makeShopifyRumPublicApi(datadogRum, false)).toBe(datadogRum)
    })

    it('does not override init options', () => {
      const initSpy = jasmine.createSpy('init')
      const datadogRum = { init: initSpy } as unknown as RumPublicApi

      const shopifyRum = makeShopifyRumPublicApi(datadogRum, false)
      shopifyRum.init({ trackViewsManually: false } as RumInitConfiguration)

      expect(initSpy).toHaveBeenCalledWith({ trackViewsManually: false })
    })
  })
})
