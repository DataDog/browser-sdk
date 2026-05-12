// Capabilities: https://www.browserstack.com/automate/capabilities

import type { BrowserConfiguration } from '../browsers.conf'

// The ECMAScript version supported by the oldest browser in the list below (Chrome 63 → ES2017).
// Used by tests that validate runtime-generated code strings (e.g. the expression compiler) which
// bypass TypeScript/webpack transpilation and must only use syntax supported by all target browsers.
export const OLDEST_BROWSER_ECMA_VERSION = 2017

export const browserConfigurations: BrowserConfiguration[] = [
  {
    sessionName: 'Edge',
    name: 'Edge',
    version: '80.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    sessionName: 'Firefox',
    name: 'Firefox',
    version: '67.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    sessionName: 'Safari desktop',
    name: 'Safari',
    version: '12.1',
    os: 'OS X',
    osVersion: 'Mojave',
  },
  {
    sessionName: 'Chrome desktop',
    name: 'Chrome',
    version: '63.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    sessionName: 'Chrome mobile',
    name: 'chrome',
    os: 'android',
    osVersion: '12.0',
    device: 'Google Pixel 6 Pro',
  },
]
