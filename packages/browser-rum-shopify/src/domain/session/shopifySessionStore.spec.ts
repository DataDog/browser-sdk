import {
  createTrackingConsentState,
  SESSION_STORE_KEY,
  startSessionManager,
  stopSessionManager,
  TrackingConsent,
} from '@datadog/browser-core'
import { LOW_HASH_UUID, mockBaseConfiguration, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { createFakeShopifyCookie } from '../../../test/mockShopifyCookie'
import { createShopifySessionStore, setShopifyBrowserApi } from './shopifySessionStore'

describe('Shopify session store', () => {
  beforeEach(() => {
    mockClock()
    registerCleanupTask(() => {
      stopSessionManager()
      setShopifyBrowserApi(undefined)
    })
  })

  function startManager() {
    return startSessionManager(
      mockBaseConfiguration({ sessionSampleRate: 100 }),
      createTrackingConsentState(TrackingConsent.GRANTED),
      createShopifySessionStore
    )
  }

  function spyOnDocumentCookie(value = '') {
    const getDocumentCookie = spyOnProperty(document, 'cookie', 'get').and.returnValue(value)
    const setDocumentCookie = spyOnProperty(document, 'cookie', 'set')
    return () => {
      expect(getDocumentCookie).not.toHaveBeenCalled()
      expect(setDocumentCookie).not.toHaveBeenCalled()
    }
  }

  it('falls back to an isolated in-memory session when the browser API is not provided', async () => {
    const manager = await startManager()

    expect(manager!.findTrackedSession()!.id).toBeDefined()
  })

  it('reuses and updates the storefront cookie without going through document.cookie', async () => {
    const { cookies, cookieStore } = createFakeShopifyCookie()
    cookies.set(SESSION_STORE_KEY, `id=${LOW_HASH_UUID}&created=${Date.now()}&expire=${Date.now() + 60_000}&c=0`)
    const expectDocumentCookieNotUsed = spyOnDocumentCookie()

    setShopifyBrowserApi({ cookie: cookieStore })
    const manager = await startManager()

    expect(manager!.findTrackedSession()!.id).toBe(LOW_HASH_UUID)
    expect(cookies.get(SESSION_STORE_KEY)).toContain(`id=${LOW_HASH_UUID}`)
    expect(cookieStore.set).toHaveBeenCalledWith(jasmine.stringMatching(/^_dd_s_v2=/))
    // The methods must be called on `browser.cookie`, as Shopify requires
    expect(cookieStore.get.calls.first().object).toBe(cookieStore)
    expect(cookieStore.set.calls.first().object).toBe(cookieStore)
    expectDocumentCookieNotUsed()
  })

  it('creates a fresh session without reading the legacy cookie through document.cookie', async () => {
    const { cookies, cookieStore } = createFakeShopifyCookie()
    const expectDocumentCookieNotUsed = spyOnDocumentCookie(
      `_dd_s=id=${LOW_HASH_UUID}&created=${Date.now()}&expire=${Date.now() + 60_000}&c=0`
    )

    setShopifyBrowserApi({ cookie: cookieStore })
    const manager = await startManager()

    const session = manager!.findTrackedSession()!
    expect(session.id).not.toBe(LOW_HASH_UUID)
    expect(cookies.get(SESSION_STORE_KEY)).toContain(`id=${session.id}`)
    expectDocumentCookieNotUsed()
  })

  it('falls back to an isolated in-memory session when Shopify cannot persist cookies', async () => {
    const { cookieStore } = createFakeShopifyCookie()
    cookieStore.get.and.returnValue(Promise.resolve(''))

    setShopifyBrowserApi({ cookie: cookieStore })
    const manager = await startManager()

    expect(manager!.findTrackedSession()!.id).toBeDefined()
    expect(cookieStore.set).not.toHaveBeenCalledWith(jasmine.stringMatching(/^_dd_s_v2=/))
  })
})
