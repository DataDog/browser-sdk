import { replaceMockableWithSpy } from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPluginOnInitOptions } from '@datadog/browser-rum-core'
import { shopifyAppPixelPlugin } from './shopifyAppPixelPlugin'
import { setShopifyBrowserApi } from './shopifySessionStore'
import type { ShopifyBrowserApi } from './webPixelUtils'

describe('shopifyAppPixelPlugin', () => {
  const browser: ShopifyBrowserApi = {
    cookie: {
      get: () => Promise.resolve(''),
      set: () => Promise.resolve(''),
    },
  }

  it('hands the Web Pixel browser API over to the session store when provided', () => {
    const setShopifyBrowserApiSpy = replaceMockableWithSpy(setShopifyBrowserApi)
    const initConfiguration = {} as RumInitConfiguration

    void shopifyAppPixelPlugin({ browser }).onInit!({ initConfiguration } as RumPluginOnInitOptions)

    expect(setShopifyBrowserApiSpy).toHaveBeenCalledOnceWith(browser)
  })

  it('works without configuration, keeping an isolated session store', () => {
    const setShopifyBrowserApiSpy = replaceMockableWithSpy(setShopifyBrowserApi)
    const initConfiguration = {
      trackUserInteractions: true,
      trackSessionAcrossSubdomains: true,
    } as unknown as RumInitConfiguration

    expect(() => void shopifyAppPixelPlugin().onInit!({ initConfiguration } as RumPluginOnInitOptions)).not.toThrow()
    expect(setShopifyBrowserApiSpy).not.toHaveBeenCalled()

    expect(initConfiguration).toEqual(
      jasmine.objectContaining({
        trackViewsManually: true,
        trackUserInteractions: false,
        trackResources: false,
        trackLongTasks: false,
        trackViewMetricsManually: true,
        sessionReplaySampleRate: 0,
        profilingSampleRate: 0,
        trackSessionAcrossSubdomains: false,
      })
    )
  })
})
