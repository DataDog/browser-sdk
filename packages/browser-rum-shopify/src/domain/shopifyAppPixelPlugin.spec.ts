import type { ExtensionApi, ShopifyGlobal } from '@shopify/web-pixels-extension'
import { display } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPluginOnInitOptions, RumPublicApi } from '@datadog/browser-rum-core'
import { createFakeAnalytics, pageViewedEvent } from '../../test/mockShopifyAnalytics'
import { shopifyAppPixelPlugin } from './shopifyAppPixelPlugin'

const CHECKOUT_URL = 'https://shop.example/checkouts/cn/abc/information'

function setupShopifyGlobal(settings: Record<string, unknown>) {
  const { analytics, emit } = createFakeAnalytics()
  const cookie = { get: () => Promise.resolve('id=abc'), set: () => Promise.resolve('') }
  const shopify: ShopifyGlobal = {
    extend: (_target, callback) => callback({ analytics, settings, browser: { cookie } } as unknown as ExtensionApi),
  }
  ;(window as { shopify?: ShopifyGlobal }).shopify = shopify
  registerCleanupTask(() => {
    delete (window as { shopify?: ShopifyGlobal }).shopify
  })
  return { emit }
}

function setup(settings: Record<string, unknown> = {}) {
  const { emit } = setupShopifyGlobal({
    rumConfig: JSON.stringify({ clientToken: 'token', applicationId: 'app-id' }),
    ...settings,
  })
  const startViewSpy = jasmine.createSpy<RumPublicApi['startView']>()
  const publicApi = { startView: startViewSpy } as unknown as RumPublicApi
  const initConfiguration = {} as RumInitConfiguration
  const setSessionCookieAccess = jasmine.createSpy<RumPluginOnInitOptions['setSessionCookieAccess']>()
  const onInitResult = shopifyAppPixelPlugin().onInit!({
    initConfiguration,
    publicApi,
    setSessionCookieAccess,
  } as unknown as RumPluginOnInitOptions)
  return { emit, startViewSpy, initConfiguration, setSessionCookieAccess, onInitResult }
}

describe('shopifyAppPixelPlugin', () => {
  it('runs with a memory session outside of a Shopify Web Pixel extension', () => {
    const initConfiguration = {} as RumInitConfiguration
    const setSessionCookieAccess = jasmine.createSpy()

    const result = shopifyAppPixelPlugin().onInit!({
      initConfiguration,
      setSessionCookieAccess,
    } as unknown as RumPluginOnInitOptions)

    expect(result).toBeUndefined()
    expect(initConfiguration).toEqual(
      jasmine.objectContaining({ trackViewsManually: true, sessionPersistence: 'memory' })
    )
    expect(setSessionCookieAccess).not.toHaveBeenCalled()
  })

  for (const rumConfig of [undefined, 'not json', 'null', '[]', '"token"']) {
    it(`aborts initialization when rumConfig is ${String(rumConfig)}`, async () => {
      const displaySpy = spyOn(display, 'error')

      const { onInitResult } = setup({ rumConfig })

      expect(await onInitResult).toBeFalse()
      expect(displaySpy).toHaveBeenCalledOnceWith('Shopify settings.rumConfig must contain a JSON object')
    })
  }

  it('merges rumConfig and forces the worker configuration', async () => {
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
        trackAutomaticViewMetrics: false,
        sessionReplaySampleRate: 0,
        profilingSampleRate: 0,
        sessionPersistence: ['cookie', 'memory'],
      })
    )
  })

  it('stores the session through Shopify browser.cookie', async () => {
    const { setSessionCookieAccess, onInitResult } = setup()
    await onInitResult

    const cookieAccess = setSessionCookieAccess.calls.argsFor(0)[0]('_dd_s_v2', {})
    expect(await cookieAccess.getAll()).toEqual(['id=abc'])
  })

  it('starts views from Shopify page_viewed events', async () => {
    const { emit, startViewSpy, onInitResult } = setup()
    await onInitResult

    emit('page_viewed', pageViewedEvent(CHECKOUT_URL))

    expect(startViewSpy).toHaveBeenCalledOnceWith({ url: CHECKOUT_URL })
  })
})
