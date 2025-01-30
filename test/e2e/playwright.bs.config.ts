import { defineConfig } from '@playwright/test'
import { getBrowserName, getEncodedCapabilities } from './lib/helpers/playwright'
import { config as baseConfig } from './playwright.base.config'
import { browserConfigurations } from './browsers.conf'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  workers: 5, // BrowserStack has a limit of 5 parallel sessions
  testIgnore: ['**/developerExtension.scenario.ts', '**/s8sInject.scenario.ts'], // The following test won't run in the BrowserStack
  // maxFailures: process.env.CI ? 1 : 0,
  projects: browserConfigurations.map((configuration) => ({
    name: configuration.name,
    metadata: configuration,
    use: {
      browserName: getBrowserName(configuration.name),
      connectOptions: {
        wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${getEncodedCapabilities(configuration)}`,
      },
    },
  })),
})
