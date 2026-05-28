// Capabilities: https://www.browserstack.com/automate/capabilities

import type { BrowserConfiguration } from '../browsers.conf'

// The ECMAScript version supported by the oldest browser in the list below (Edge/Chrome 80 → ES2020).
// Used by tests that validate runtime-generated code strings (e.g. the expression compiler) which
// bypass TypeScript/webpack transpilation and must only use syntax supported by all target browsers.
export const OLDEST_BROWSER_ECMA_VERSION = 2020

export const browserConfigurations: BrowserConfiguration[] = [
  {
    id: 'edge',
    sessionName: 'Edge',
    name: 'Edge',
    version: '80.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    id: 'firefox',
    sessionName: 'Firefox',
    name: 'Firefox',
    version: '78.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    id: 'safari-desktop',
    sessionName: 'Safari desktop',
    name: 'Safari',
    version: '14.0',
    os: 'OS X',
    osVersion: 'Big Sur',
  },
  {
    id: 'chrome-desktop',
    sessionName: 'Chrome desktop',
    name: 'Chrome',
    version: '80.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    id: 'chrome-mobile',
    sessionName: 'Chrome mobile',
    name: 'chrome',
    os: 'android',
    osVersion: '15.0',
    device: 'Google Pixel 6 Pro',
  },
]
