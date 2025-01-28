import { defineConfig } from '@playwright/test'
import type { BrowserConfiguration } from '../browsers.conf'
import { getBuildInfos } from '../envUtils'
import { config as baseConfig } from './playwright.base.config'
import { browserConfigurations } from './browsers.conf'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  workers: 5,
  // The following test won't run in the BrowserStack
  testIgnore: ['**/developerExtension.scenario.ts', '**/s8sInject.scenario.ts'],
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
    'browserstack.playwrightVersion': '1.49.0', // TODO fixme
    'client.playwrightVersion': '1.49.0',
    'browserstack.debug': 'true', // enabling visual logs
    'browserstack.console': 'info', // Enabling Console logs for the test
    'browserstack.networkLogs': 'true', // Enabling network logs for the test
    'browserstack.interactiveDebugging': 'false',
  }
}
