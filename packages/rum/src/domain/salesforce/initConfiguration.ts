import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { createSalesforceResourcePlugin } from './resourcePlugin'

const SALESFORCE_INIT_DEFAULTS: Pick<RumInitConfiguration, 'trackViewsManually'> = {
  trackViewsManually: true,
}

export function buildSalesforceInitConfiguration(initConfiguration: RumInitConfiguration): RumInitConfiguration {
  const shouldInjectResourcePlugin = initConfiguration.trackResources !== false

  return {
    ...initConfiguration,
    ...SALESFORCE_INIT_DEFAULTS,
    ...(shouldInjectResourcePlugin && {
      trackResources: false,
      plugins: [...(initConfiguration.plugins || []), createSalesforceResourcePlugin(initConfiguration)],
    }),
  }
}
