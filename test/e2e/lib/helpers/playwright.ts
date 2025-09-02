import fs from 'fs'
import path from 'path'
import type { PlaywrightWorkerOptions } from '@playwright/test'
import type { BrowserConfiguration } from '../../../browsers.conf'
import { getBuildInfos } from '../../../envUtils'

export const DEV_SERVER_BASE_URL = 'http://localhost:8080'

export function getPlaywrightConfigBrowserName(name: string): PlaywrightWorkerOptions['browserName'] {
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
  const playwrightVersion = getLocalPlaywrightVersion()
  return {
    os: configuration.os,
    os_version: configuration.osVersion,
    browser: configuration.name,
    browser_version: configuration.version,
    'browserstack.username': process.env.BS_USERNAME,
    'browserstack.accessKey': process.env.BS_ACCESS_KEY,
    project: 'browser sdk e2e',
    build: getBuildInfos(),
    name: configuration.sessionName,
    'browserstack.local': true,
    'browserstack.playwrightVersion': playwrightVersion,
    'client.playwrightVersion': playwrightVersion,
    'browserstack.debug': false,
    'browserstack.console': 'info',
    'browserstack.networkLogs': false,
    'browserstack.interactiveDebugging': false,
  }
}

function getLocalPlaywrightVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json')
    const content = fs.readFileSync(pkgPath, 'utf-8')
    const pkg = JSON.parse(content) as {
      devDependencies?: Record<string, string>
      dependencies?: Record<string, string>
    }
    return pkg.devDependencies?.['@playwright/test'] || pkg.dependencies?.['@playwright/test'] || '1.latest'
  } catch {
    return '1.latest'
  }
}
