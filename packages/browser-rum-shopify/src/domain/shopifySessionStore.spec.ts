import {
  createTrackingConsentState,
  display,
  SESSION_STORE_KEY,
  startSessionManager,
  stopSessionManager,
  TrackingConsent,
} from '@datadog/browser-core'
import { LOW_HASH_UUID, mockBaseConfiguration, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { createFakeShopifyCookie } from '../../test/mockShopifyCookie'
import { createShopifySessionStoreFactory } from './shopifySessionStore'

describe('Shopify session store', () => {
  beforeEach(() => {
    mockClock()
    registerCleanupTask(stopSessionManager)
  })

  it('defers cookie access until the factory is called', () => {
    const { cookieStore } = createFakeShopifyCookie()

    createShopifySessionStoreFactory({ cookie: cookieStore })

    expect(cookieStore.get).not.toHaveBeenCalled()
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('reuses and updates the storefront cookie without putting the API in configuration', async () => {
    const { cookies, cookieStore } = createFakeShopifyCookie()
    cookies.set(SESSION_STORE_KEY, `id=${LOW_HASH_UUID}&created=${Date.now()}&expire=${Date.now() + 60_000}&c=0`)
    const configuration = mockBaseConfiguration({ sessionSampleRate: 100 })
    const getDocumentCookie = spyOnProperty(document, 'cookie', 'get').and.returnValue('')
    const setDocumentCookie = spyOnProperty(document, 'cookie', 'set')

    const manager = await startSessionManager(
      configuration,
      createTrackingConsentState(TrackingConsent.GRANTED),
      createShopifySessionStoreFactory({ cookie: cookieStore })
    )

    expect(manager!.findTrackedSession()!.id).toBe(LOW_HASH_UUID)
    expect(cookies.get(SESSION_STORE_KEY)).toContain(`id=${LOW_HASH_UUID}`)
    expect(cookieStore.set).toHaveBeenCalledWith(jasmine.stringMatching(/^_dd_s_v2=/))
    expect(cookieStore.get.calls.first().object).toBe(cookieStore)
    expect(cookieStore.set.calls.first().object).toBe(cookieStore)
    expect(configuration.sessionPersistence).toBeUndefined()
    expect(getDocumentCookie).not.toHaveBeenCalled()
    expect(setDocumentCookie).not.toHaveBeenCalled()
  })

  it('creates a fresh session without reading the legacy cookie through document.cookie', async () => {
    const { cookies, cookieStore } = createFakeShopifyCookie()
    const getDocumentCookie = spyOnProperty(document, 'cookie', 'get').and.returnValue(
      `_dd_s=id=${LOW_HASH_UUID}&created=${Date.now()}&expire=${Date.now() + 60_000}&c=0`
    )
    const setDocumentCookie = spyOnProperty(document, 'cookie', 'set')

    const manager = await startSessionManager(
      mockBaseConfiguration({ sessionSampleRate: 100 }),
      createTrackingConsentState(TrackingConsent.GRANTED),
      createShopifySessionStoreFactory({ cookie: cookieStore })
    )

    const session = manager!.findTrackedSession()!
    expect(session.id).not.toBe(LOW_HASH_UUID)
    expect(cookies.get(SESSION_STORE_KEY)).toContain(`id=${session.id}`)
    expect(getDocumentCookie).not.toHaveBeenCalled()
    expect(setDocumentCookie).not.toHaveBeenCalled()
  })

  it('does not initialize a session when Shopify cannot persist cookies', async () => {
    const { cookieStore } = createFakeShopifyCookie()
    cookieStore.get.and.returnValue(Promise.resolve(''))
    spyOn(display, 'warn')

    const manager = await startSessionManager(
      mockBaseConfiguration(),
      createTrackingConsentState(TrackingConsent.GRANTED),
      createShopifySessionStoreFactory({ cookie: cookieStore })
    )

    expect(manager).toBeUndefined()
    expect(cookieStore.set).not.toHaveBeenCalledWith(jasmine.stringMatching(/^_dd_s_v2=/))
  })
})
