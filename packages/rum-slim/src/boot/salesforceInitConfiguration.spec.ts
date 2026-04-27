import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { buildSalesforceInitConfiguration } from './salesforceInitConfiguration'

describe('salesforce init configuration', () => {
  it('forces the slim salesforce bundle into manual view tracking mode', () => {
    const initConfiguration = buildSalesforceInitConfiguration({
      applicationId: 'app-id',
      clientToken: 'client-token',
      trackViewsManually: false,
      trackResources: true,
      trackUserInteractions: true,
      trackLongTasks: true,
    } as RumInitConfiguration)

    expect(initConfiguration.trackViewsManually).toBeTrue()
    expect(initConfiguration.trackResources).toBeFalse()
    expect(initConfiguration.trackUserInteractions).toBeFalse()
    expect(initConfiguration.trackLongTasks).toBeFalse()
  })

  it('preserves customer configuration unrelated to the salesforce view-tracking policy', () => {
    const initConfiguration = buildSalesforceInitConfiguration({
      applicationId: 'app-id',
      clientToken: 'client-token',
      service: 'browser-sdk-sandbox',
      env: 'dev',
      site: 'datadoghq.com',
    } as RumInitConfiguration)

    expect(initConfiguration).toEqual(
      jasmine.objectContaining({
        applicationId: 'app-id',
        clientToken: 'client-token',
        service: 'browser-sdk-sandbox',
        env: 'dev',
        site: 'datadoghq.com',
      })
    )
  })
})
