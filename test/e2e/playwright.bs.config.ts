import { defineConfig } from '@playwright/test'
import { getPlaywrightConfigBrowserName, getEncodedCapabilities } from './lib/helpers/playwright'
import { config as baseConfig } from './playwright.base.config'
import { browserConfigurations } from './browsers.conf'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  workers: 5, // BrowserStack has a limit of 5 parallel sessions
  testIgnore: ['**/developerExtension.scenario.ts', '**/s8sInject.scenario.ts'], // These test won't run in the BrowserStack
  projects: browserConfigurations.map((configuration) => ({
    name: configuration.sessionName,
    metadata: configuration,
    use: {
      browserName: getPlaywrightConfigBrowserName(configuration.name),
      connectOptions: {
        wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${getEncodedCapabilities(configuration)}`,
      },
    },
  })),
})
