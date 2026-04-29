import type { RumInitConfiguration } from '@datadog/browser-rum-core'

const SALESFORCE_INIT_DEFAULTS: Pick<RumInitConfiguration, 'trackViewsManually'> = {
  trackViewsManually: true,
}

export function buildSalesforceInitConfiguration(initConfiguration: RumInitConfiguration): RumInitConfiguration {
  return {
    ...initConfiguration,
    ...SALESFORCE_INIT_DEFAULTS,
  }
}
