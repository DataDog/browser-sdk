import type { RumPublicApi } from '@datadog/browser-rum-core'
import { makeSalesforceRumPublicApi } from './salesforce'

describe('salesforce', () => {
  let rumPublicApi: RumPublicApi
  let initSpy: jasmine.Spy<RumPublicApi['init']>
  let startViewSpy: jasmine.Spy<RumPublicApi['startView']>

  beforeEach(() => {
    initSpy = jasmine.createSpy()
    startViewSpy = jasmine.createSpy()
    rumPublicApi = {
      init: initSpy,
      startView: startViewSpy,
    } as unknown as RumPublicApi
  })

  it('waits for the first Salesforce view before initializing RUM', () => {
    const salesforceApi = makeSalesforceRumPublicApi(rumPublicApi)

    salesforceApi.initSalesforce({
      applicationId: 'application-id',
      clientToken: 'client-token',
    })

    expect(initSpy).not.toHaveBeenCalled()
    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('forces Salesforce-only init settings', async () => {
    const salesforceApi = makeSalesforceRumPublicApi(rumPublicApi)

    salesforceApi.initSalesforce({
      applicationId: 'application-id',
      clientToken: 'client-token',
      profilingSampleRate: 100,
      sessionReplaySampleRate: 100,
      trackViewsManually: false,
    } as any)
    await salesforceApi.startSalesforceView({
      pageReference: {},
      baseUrl: 'https://example.com',
      generateUrl: () => Promise.resolve('/generated'),
    })

    expect(initSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        profilingSampleRate: 0,
        sessionReplaySampleRate: 0,
        trackViewsManually: true,
      })
    )
  })

  it('passes customer init settings through', async () => {
    const salesforceApi = makeSalesforceRumPublicApi(rumPublicApi)

    salesforceApi.initSalesforce({
      applicationId: 'application-id',
      clientToken: 'client-token',
      site: 'datadoghq.eu',
      service: 'custom-service',
      env: 'prod',
    })
    await salesforceApi.startSalesforceView({
      pageReference: {},
      baseUrl: 'https://example.com',
      generateUrl: () => Promise.resolve('/generated'),
    })

    expect(initSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        site: 'datadoghq.eu',
        service: 'custom-service',
        env: 'prod',
      })
    )
  })

  it('starts Salesforce views from page references', async () => {
    const salesforceApi = makeSalesforceRumPublicApi(rumPublicApi)
    const pageReference = {}

    salesforceApi.initSalesforce({
      applicationId: 'application-id',
      clientToken: 'client-token',
    })
    await salesforceApi.startSalesforceView({
      pageReference,
      baseUrl: 'https://example.com',
      generateUrl: (value) => {
        expect(value).toBe(pageReference)
        return Promise.resolve('/generated')
      },
    })

    expect(startViewSpy.calls.mostRecent().args[0]).toEqual({
      name: '/generated',
      url: 'https://example.com/generated',
    })
  })

  it('uses the LWC-provided base URL to build absolute view URLs', async () => {
    const salesforceApi = makeSalesforceRumPublicApi(rumPublicApi)

    salesforceApi.initSalesforce({
      applicationId: 'application-id',
      clientToken: 'client-token',
    })
    await salesforceApi.startSalesforceView({
      pageReference: {},
      baseUrl: 'https://example.com',
      generateUrl: () => Promise.resolve('/lightning/page/home'),
    })

    expect(startViewSpy.calls.mostRecent().args[0]).toEqual({
      name: '/lightning/page/home',
      url: 'https://example.com/lightning/page/home',
    })
  })

  it('deduplicates repeated Salesforce view URLs', async () => {
    const salesforceApi = makeSalesforceRumPublicApi(rumPublicApi)

    salesforceApi.initSalesforce({
      applicationId: 'application-id',
      clientToken: 'client-token',
    })
    await salesforceApi.startSalesforceView({
      pageReference: {},
      baseUrl: 'https://example.com',
      generateUrl: () => Promise.resolve('/generated'),
    })
    await salesforceApi.startSalesforceView({
      pageReference: {},
      baseUrl: 'https://example.com',
      generateUrl: () => Promise.resolve('/generated'),
    })

    expect(startViewSpy).toHaveBeenCalledTimes(1)
    expect(initSpy).toHaveBeenCalledTimes(1)
  })

  it('starts route-change views after RUM is initialized', async () => {
    const salesforceApi = makeSalesforceRumPublicApi(rumPublicApi)

    salesforceApi.initSalesforce({
      applicationId: 'application-id',
      clientToken: 'client-token',
    })
    await salesforceApi.startSalesforceView({
      pageReference: {},
      baseUrl: 'https://example.com',
      generateUrl: () => Promise.resolve('/first'),
    })
    await salesforceApi.startSalesforceView({
      pageReference: {},
      baseUrl: 'https://example.com',
      generateUrl: () => Promise.resolve('/second'),
    })

    expect(startViewSpy).toHaveBeenCalledTimes(2)
    expect(initSpy).toHaveBeenCalledTimes(1)
  })

  it('does not start a new view when Salesforce URL generation fails', async () => {
    const salesforceApi = makeSalesforceRumPublicApi(rumPublicApi)

    salesforceApi.initSalesforce({
      applicationId: 'application-id',
      clientToken: 'client-token',
    })
    await salesforceApi.startSalesforceView({
      pageReference: {},
      baseUrl: 'https://example.com',
      generateUrl: () => Promise.reject(new Error('failed')),
    })

    expect(startViewSpy).not.toHaveBeenCalled()
    expect(initSpy).not.toHaveBeenCalled()
  })
})
