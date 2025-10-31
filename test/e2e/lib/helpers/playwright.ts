import type { PlaywrightWorkerOptions } from '@playwright/test'
import type { BrowserConfiguration } from '../../../browsers.conf'
import { getBuildInfos } from '../../../envUtils.ts'
import packageJson from '../../../../package.json' with { type: 'json' }

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
  const playwrightVersion = resolvePlaywrightVersionFromPackageJson()
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

function resolvePlaywrightVersionFromPackageJson(): string {
  const rootPkg = packageJson as unknown as {
    devDependencies?: Record<string, string>
    dependencies?: Record<string, string>
  }
  const version = rootPkg.devDependencies?.['@playwright/test'] || rootPkg.dependencies?.['@playwright/test']
  if (!version) {
    throw new Error('Unable to resolve @playwright/test version from package.json')
  }
  return version
}
