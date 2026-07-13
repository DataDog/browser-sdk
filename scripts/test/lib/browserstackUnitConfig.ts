import { playwright } from '@vitest/browser-playwright'
import type { BrowserInstanceOption } from 'vitest/node'

export interface BrowserStackUnitConfiguration {
  sessionName: string
  name: string
  version?: string
  os?: string
  osVersion?: string
}

export interface BrowserStackCapabilityOptions {
  username?: string
  accessKey?: string
  localIdentifier?: string
  build?: string
  playwrightVersion: string
}

export function getBrowserStackCapabilities(
  configuration: BrowserStackUnitConfiguration,
  options: BrowserStackCapabilityOptions
): Record<string, string | boolean | undefined> {
  const isBundledBrowser = configuration.name.startsWith('playwright-')

  return {
    os: configuration.os,
    os_version: configuration.osVersion,
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

export function getBrowserStackInstance(
  configuration: BrowserStackUnitConfiguration,
  options: BrowserStackCapabilityOptions
) {
  const capabilities = getBrowserStackCapabilities(configuration, options)

  return {
    // BrowserStack's Playwright endpoint is always reached through chromium.connect(); the
    // capability selects whether the remote browser is Chrome, Edge, Firefox, or WebKit.
    browser: 'chromium' as const,
    name: configuration.sessionName,
    // Vitest reads remote connection options from each instance provider. Other instance keys are
    // ignored and make Playwright fall back to launching a browser on the CI runner.
    provider: playwright({
      connectOptions: {
        wsEndpoint: `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(capabilities))}`,
      },
    }),
  } satisfies BrowserInstanceOption
}
