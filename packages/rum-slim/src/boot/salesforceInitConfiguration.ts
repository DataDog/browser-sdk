import type { RumInitConfiguration } from '@datadog/browser-rum-core'

const SALESFORCE_VIEW_TRACKING_DEFAULTS: Pick<
  RumInitConfiguration,
  'trackViewsManually' | 'trackResources' | 'trackUserInteractions' | 'trackLongTasks'
> = {
  trackViewsManually: true,
  trackResources: false,
  trackUserInteractions: false,
  trackLongTasks: false,
}

export function buildSalesforceInitConfiguration(initConfiguration: RumInitConfiguration): RumInitConfiguration {
  return {
    ...initConfiguration,
    ...SALESFORCE_VIEW_TRACKING_DEFAULTS,
  }
}
