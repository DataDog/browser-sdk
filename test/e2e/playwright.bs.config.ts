import { defineConfig } from '@playwright/test'
import type { BrowserConfiguration } from '../browsers.conf'
import { getBuildInfos } from '../envUtils'
import { config as baseConfig } from './playwright.base.config'
import { browserConfigurations } from './browsers.conf'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  workers: 5, // BrowserStack has a limit of 5 parallel sessions
  testIgnore: ['**/developerExtension.scenario.ts', '**/s8sInject.scenario.ts'], // The following test won't run in the BrowserStack
  projects: browserConfigurations.map((configuration) => ({
    name: configuration.name,
    use: {
      connectOptions: {
        wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${getEncodedCapabilities(configuration)}`,
      },
    },
  })),
})

function getEncodedCapabilities(configuration: BrowserConfiguration) {
  return encodeURIComponent(JSON.stringify(getCapabilities(configuration)))
}

// see: https://www.browserstack.com/docs/automate/playwright/playwright-capabilities
function getCapabilities(configuration: BrowserConfiguration) {
  return {
    os: configuration.os,
    os_version: configuration.osVersion,
    browser: configuration.name,
    browser_version: configuration.version,
    device: configuration.device,
    'browserstack.username': process.env.BS_USERNAME,
    'browserstack.accessKey': process.env.BS_ACCESS_KEY,
    project: 'browser sdk e2e',
    build: getBuildInfos(),
    name: configuration.sessionName,
    'browserstack.local': 'true',
    'browserstack.playwrightVersion': '1.latest',
    'client.playwrightVersion': '1.latest',
    'browserstack.debug': 'false',
    'browserstack.console': 'info',
    'browserstack.networkLogs': 'false',
    'browserstack.interactiveDebugging': 'false',
  }
}
