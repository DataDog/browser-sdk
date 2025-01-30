import type { PlaywrightWorkerOptions } from '@playwright/test'
import type { BrowserConfiguration } from '../../../browsers.conf'
import { getBuildInfos } from '../../../envUtils'

export function getBrowserName(name: string): PlaywrightWorkerOptions['browserName'] {
  if (name.includes('firefox')) {
    return 'firefox'
  }

  if (name.includes('webkit')) {
    return 'webkit'
  }

  return 'chromium'
}

export function getEncodedCapabilities(configuration: BrowserConfiguration) {
  return encodeURIComponent(JSON.stringify(getCapabilities(configuration)))
}

// see: https://www.browserstack.com/docs/automate/playwright/playwright-capabilities
function getCapabilities(configuration: BrowserConfiguration) {
  return {
    os: configuration.os,
    os_version: configuration.osVersion,
    browser: configuration.name,
    browser_version: configuration.version,
    ...(configuration.device ? { deviceName: configuration.device } : {}),
    'browserstack.username': process.env.BS_USERNAME,
    'browserstack.accessKey': process.env.BS_ACCESS_KEY,
    project: 'browser sdk e2e',
    build: getBuildInfos(),
    name: configuration.sessionName,
    'browserstack.local': true,
    'browserstack.playwrightVersion': '1.latest',
    'client.playwrightVersion': '1.latest',
    'browserstack.debug': false,
    'browserstack.console': 'info',
    'browserstack.networkLogs': false,
    'browserstack.interactiveDebugging': false,
  }
}
