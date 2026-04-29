import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { buildSalesforceInitConfiguration } from './initConfiguration'

describe('salesforce init configuration', () => {
  it('forces manual view tracking', () => {
    const initConfiguration = buildSalesforceInitConfiguration({
      applicationId: 'app-id',
      clientToken: 'client-token',
      trackViewsManually: false,
    } as RumInitConfiguration)

    expect(initConfiguration.trackViewsManually).toBeTrue()
  })

  it('preserves customer configuration unrelated to view tracking mode', () => {
    const initConfiguration = buildSalesforceInitConfiguration({
      applicationId: 'app-id',
      clientToken: 'client-token',
      service: 'browser-sdk-sandbox',
      env: 'dev',
      site: 'datadoghq.com',
      trackResources: false,
      trackUserInteractions: false,
      trackLongTasks: false,
      sessionReplaySampleRate: 0,
      profilingSampleRate: 0,
    } as RumInitConfiguration)

    expect(initConfiguration).toEqual(
      jasmine.objectContaining({
        applicationId: 'app-id',
        clientToken: 'client-token',
        service: 'browser-sdk-sandbox',
        env: 'dev',
        site: 'datadoghq.com',
        trackResources: false,
        trackUserInteractions: false,
        trackLongTasks: false,
        sessionReplaySampleRate: 0,
        profilingSampleRate: 0,
      })
    )
  })
})
