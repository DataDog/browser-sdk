import { display, startSessionManager, startSessionManagerStub } from '@datadog/browser-core'
import type { SessionManager } from '@datadog/browser-core'
import { replaceMockable, replaceMockableWithSpy } from '@datadog/browser-core/test'
import { startInternalApiBatch } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi } from '../domain/shopifyAnalytics'
import { patchSandboxedIframeApis } from './patchSandboxedIframeApis'
import { makeShopifyRumApi } from './makeShopifyRumApi'

function createFakeAnalytics(): ShopifyAnalyticsApi {
  return { subscribe: jasmine.createSpy('subscribe') }
}

function setupInitStack() {
  replaceMockable(patchSandboxedIframeApis, () => undefined)
  replaceMockable(startSessionManager, () => startSessionManagerStub())
  return replaceMockableWithSpy(startInternalApiBatch)
}

function initShopifyRum(overrides: Record<string, unknown> = {}) {
  const api = makeShopifyRumApi()
  api.init({
    clientToken: 'token',
    applicationId: 'app-id',
    shopifyAnalytics: createFakeAnalytics(),
    ...overrides,
  })
  return api
}

describe('makeShopifyRumApi', () => {
  it('patches sandboxed iframe APIs, starts the internal API stack and wires Shopify bindings', () => {
    const patchSpy = replaceMockableWithSpy(patchSandboxedIframeApis)
    replaceMockable(startSessionManager, () => startSessionManagerStub())
    const startInternalApiBatchSpy = replaceMockableWithSpy(startInternalApiBatch)
    const analytics = createFakeAnalytics()

    initShopifyRum({ shopifyAnalytics: analytics })

    expect(patchSpy).toHaveBeenCalled()
    // Views / clicks / checkout UI extension errors are collected by driving the internal API.
    expect(analytics.subscribe).toHaveBeenCalledWith('page_viewed', jasmine.any(Function))
    expect(analytics.subscribe).toHaveBeenCalledWith('clicked', jasmine.any(Function))
    expect(analytics.subscribe).toHaveBeenCalledWith('ui_extension_errored', jasmine.any(Function))
    expect(startInternalApiBatchSpy).toHaveBeenCalled()
  })

  it('forces cookie session persistence and does not leak shopifyAnalytics in the configuration', () => {
    const startInternalApiBatchSpy = setupInitStack()

    initShopifyRum()

    const configuration = startInternalApiBatchSpy.calls.argsFor(0)[0] as Record<string, unknown>
    expect(configuration.sessionPersistence).toEqual(['cookie'])
    expect('shopifyAnalytics' in configuration).toBe(false)
  })

  it('passes the configuration to the session manager', () => {
    replaceMockable(patchSandboxedIframeApis, () => undefined)
    const startSessionManagerSpy = replaceMockableWithSpy(startSessionManager)
    startSessionManagerSpy.and.returnValue(Promise.resolve({} as SessionManager))
    replaceMockableWithSpy(startInternalApiBatch)

    initShopifyRum()

    const configuration = startSessionManagerSpy.calls.argsFor(0)[0] as Record<string, unknown>
    expect(configuration.sessionPersistence).toEqual(['cookie'])
  })

  it('does not start anything without a shopifyAnalytics configuration (storefront path)', () => {
    const startInternalApiBatchSpy = setupInitStack()
    spyOn(display, 'warn')
    const api = makeShopifyRumApi()

    api.init({ clientToken: 'token', applicationId: 'app-id' })

    expect(display.warn).toHaveBeenCalled()
    expect(startInternalApiBatchSpy).not.toHaveBeenCalled()
  })

  it('ignores subsequent init calls', () => {
    const startInternalApiBatchSpy = setupInitStack()
    const api = makeShopifyRumApi()
    const analytics = createFakeAnalytics()

    api.init({
      clientToken: 'token',
      applicationId: 'app-id',
      shopifyAnalytics: analytics,
    })
    api.init({
      clientToken: 'token',
      applicationId: 'app-id',
      shopifyAnalytics: createFakeAnalytics(),
    })

    // The first analytics handle stays the only one wired: the bindings subscribe once.
    expect((analytics.subscribe as jasmine.Spy).calls.count()).toBe(3)
    expect(startInternalApiBatchSpy.calls.count()).toBe(1)
  })

  it('does not start when the configuration is invalid', () => {
    const startInternalApiBatchSpy = setupInitStack()

    initShopifyRum({ clientToken: undefined })

    expect(startInternalApiBatchSpy).not.toHaveBeenCalled()
  })
})
