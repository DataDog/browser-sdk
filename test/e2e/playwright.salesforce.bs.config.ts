import { defineConfig } from '@playwright/test'
import { browserConfigurations } from './browsers.conf'
import { getEncodedCapabilitiesWithOptions, getPlaywrightConfigBrowserName } from './lib/helpers/playwright'
import baseConfig from './playwright.salesforce.base.config'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  workers: 5,
  projects: browserConfigurations.map((configuration) => ({
    name: configuration.sessionName,
    metadata: configuration,
    use: {
      browserName: getPlaywrightConfigBrowserName(configuration.name),
      connectOptions: {
        wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${getEncodedCapabilitiesWithOptions(configuration, {
          localTesting: false,
        })}`,
      },
    },
  })),
})
