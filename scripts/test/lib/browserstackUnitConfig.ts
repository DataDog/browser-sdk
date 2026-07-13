export interface BrowserStackUnitConfiguration {
  sessionName: string
  name: string
  version?: string
  os?: string
  osVersion?: string
  device?: string
}

export interface BrowserStackCapabilityOptions {
  username?: string
  accessKey?: string
  localIdentifier?: string
  build?: string
  playwrightVersion: string
}

export function getPlaywrightBrowserName(name: string): 'chromium' | 'firefox' | 'webkit' {
  if (name.includes('firefox')) {
    return 'firefox'
  }
  if (name.includes('webkit')) {
    return 'webkit'
  }
  return 'chromium'
}

export function getBrowserStackCapabilities(
  configuration: BrowserStackUnitConfiguration,
  options: BrowserStackCapabilityOptions
): Record<string, string | boolean | undefined> {
  const isBundledBrowser = configuration.name.startsWith('playwright-')

  return {
    ...(configuration.device
      ? { osVersion: configuration.osVersion, deviceName: configuration.device, realMobile: 'true' }
      : { os: configuration.os, os_version: configuration.osVersion }),
    browser: configuration.name,
    ...(configuration.version ? { browser_version: configuration.version } : {}),
    'browserstack.username': options.username,
    'browserstack.accessKey': options.accessKey,
    project: 'browser sdk unit',
    build: options.build,
    name: configuration.sessionName,
    'browserstack.local': true,
    'browserstack.localIdentifier': options.localIdentifier ?? '',
    ...(isBundledBrowser ? { 'browserstack.playwrightVersion': options.playwrightVersion } : {}),
    'client.playwrightVersion': options.playwrightVersion,
    'browserstack.debug': false,
    'browserstack.console': 'info',
    'browserstack.networkLogs': false,
    'browserstack.interactiveDebugging': false,
  }
}
