import type { ExtensionApi, ShopifyGlobal } from '@shopify/web-pixels-extension'
import { display } from '@datadog/browser-core'
import { registerCleanupTask, replaceMockableWithSpy } from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPluginOnInitOptions, RumPublicApi } from '@datadog/browser-rum-core'
import { createFakeAnalytics, pageViewedEvent } from '../../test/mockShopifyAnalytics'
import { shopifyAppPixelPlugin } from './shopifyAppPixelPlugin'
import { setShopifyBrowserApi } from './session/shopifySessionStore'

function setupShopifyGlobal(settings: Record<string, unknown>) {
  const { analytics, emit } = createFakeAnalytics()
  const browser = { cookie: { get: () => Promise.resolve('id=abc'), set: () => Promise.resolve('') } }
  const shopify: ShopifyGlobal = {
    extend: (_target, callback) => callback({ analytics, settings, browser } as unknown as ExtensionApi),
  }
  ;(window as { shopify?: ShopifyGlobal }).shopify = shopify
  registerCleanupTask(() => {
    delete (window as { shopify?: ShopifyGlobal }).shopify
  })
  return { browser, emit }
}

function setup(settings: Record<string, unknown> = {}) {
  const { browser, emit } = setupShopifyGlobal({
    rumConfig: JSON.stringify({ clientToken: 'token', applicationId: 'app-id' }),
    ...settings,
  })
  const publicApi = jasmine.createSpyObj<RumPublicApi>('publicApi', ['startView'])
  const initConfiguration = {
    trackUserInteractions: true,
    trackSessionAcrossSubdomains: true,
  } as unknown as RumInitConfiguration
  const setShopifyBrowserApiSpy = replaceMockableWithSpy(setShopifyBrowserApi)

  const onInitResult = shopifyAppPixelPlugin().onInit!({
    initConfiguration,
    publicApi,
  } as unknown as RumPluginOnInitOptions)

  return { browser, emit, publicApi, initConfiguration, setShopifyBrowserApiSpy, onInitResult }
}

describe('shopifyAppPixelPlugin', () => {
  it('aborts initialization outside of a Shopify Web Pixel extension', () => {
    const displaySpy = spyOn(display, 'error')

    const result = shopifyAppPixelPlugin().onInit!({ initConfiguration: {} } as RumPluginOnInitOptions)

    expect(result).toBeFalse()
    expect(displaySpy).toHaveBeenCalledOnceWith('shopifyAppPixelPlugin must run in a Shopify Web Pixel extension')
  })

  for (const rumConfig of [undefined, 'not json', 'null', '[]', '"token"']) {
    it(`aborts initialization when rumConfig is ${String(rumConfig)}`, async () => {
      const displaySpy = spyOn(display, 'error')

      const { onInitResult } = setup({ rumConfig })

      expect(await onInitResult).toBeFalse()
      expect(displaySpy).toHaveBeenCalledOnceWith('Shopify settings.rumConfig must contain a JSON object')
    })
  }

  it('merges rumConfig into the init configuration and forces the worker configuration', async () => {
    const { initConfiguration, onInitResult } = setup()

    expect(await onInitResult).toBeUndefined()
    expect(initConfiguration).toEqual(
      jasmine.objectContaining({
        clientToken: 'token',
        applicationId: 'app-id',
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

  it('hands the Web Pixel browser API over to the session store', async () => {
    const { browser, setShopifyBrowserApiSpy, onInitResult } = setup()

    expect(await onInitResult).toBeUndefined()
    expect(setShopifyBrowserApiSpy).toHaveBeenCalledOnceWith(browser)
  })

  it('starts a view with the page URL on page_viewed', async () => {
    const { emit, publicApi, onInitResult } = setup()

    expect(await onInitResult).toBeUndefined()
    emit('page_viewed', pageViewedEvent('https://shop.example/checkouts/cn/abc'))

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(publicApi.startView).toHaveBeenCalledOnceWith({ url: 'https://shop.example/checkouts/cn/abc' })
  })
})
