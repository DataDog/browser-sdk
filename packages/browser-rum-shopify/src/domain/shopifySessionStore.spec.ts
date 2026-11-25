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
import { createShopifySessionStore, setShopifyBrowserApi } from './shopifySessionStore'

describe('Shopify session store', () => {
  beforeEach(() => {
    mockClock()
    registerCleanupTask(() => {
      stopSessionManager()
      setShopifyBrowserApi(undefined)
    })
  })

  it('defers cookie access until the store is created', () => {
    const { cookieStore } = createFakeShopifyCookie()

    setShopifyBrowserApi({ cookie: cookieStore })

    expect(cookieStore.get).not.toHaveBeenCalled()
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('falls back to an isolated in-memory session when the browser API is not provided', async () => {
    const manager = await startSessionManager(
      mockBaseConfiguration({ sessionSampleRate: 100 }),
      createTrackingConsentState(TrackingConsent.GRANTED),
      createShopifySessionStore
    )

    expect(manager!.findTrackedSession()!.id).toBeDefined()
  })

  it('reuses and updates the storefront cookie without going through document.cookie', async () => {
    const { cookies, cookieStore } = createFakeShopifyCookie()
    cookies.set(SESSION_STORE_KEY, `id=${LOW_HASH_UUID}&created=${Date.now()}&expire=${Date.now() + 60_000}&c=0`)
    const configuration = mockBaseConfiguration({ sessionSampleRate: 100 })
    const getDocumentCookie = spyOnProperty(document, 'cookie', 'get').and.returnValue('')
    const setDocumentCookie = spyOnProperty(document, 'cookie', 'set')

    setShopifyBrowserApi({ cookie: cookieStore })
    const manager = await startSessionManager(
      configuration,
      createTrackingConsentState(TrackingConsent.GRANTED),
      createShopifySessionStore
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

    setShopifyBrowserApi({ cookie: cookieStore })
    const manager = await startSessionManager(
      mockBaseConfiguration({ sessionSampleRate: 100 }),
      createTrackingConsentState(TrackingConsent.GRANTED),
      createShopifySessionStore
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
    cookieStore.set.and.returnValue(Promise.resolve(''))
    spyOn(display, 'warn')

    setShopifyBrowserApi({ cookie: cookieStore })
    const manager = await startSessionManager(
      mockBaseConfiguration(),
      createTrackingConsentState(TrackingConsent.GRANTED),
      createShopifySessionStore
    )

    expect(manager).toBeUndefined()
    expect(cookieStore.set).not.toHaveBeenCalledWith(jasmine.stringMatching(/^_dd_s_v2=/))
  })
})
