// Capabilities: https://www.browserstack.com/automate/capabilities

import type { BrowserConfiguration } from '../browsers.conf'

// Vitest Browser Mode supports Chrome >=87, Edge >=88, Firefox >=78 and Safari >=15.4. Firefox
// and WebKit are selected through Playwright's bundled-browser capabilities, so BrowserStack uses
// the versions paired with the pinned `playwright` dependency.
//
// The ECMAScript version supported by the oldest branded browser below (Chrome 87 → ES2020).
// Used by tests that validate runtime-generated code strings (e.g. the expression compiler) which
// bypass TypeScript/webpack transpilation and must only use syntax supported by all target browsers.
export const OLDEST_BROWSER_ECMA_VERSION = 2020

// BrowserStack's real Android integration uses Playwright's separate `_android` API, which is not
// supported by Vitest's Playwright provider. Keep this matrix to browser-type connections only.
export const browserConfigurations: BrowserConfiguration[] = [
  {
    id: 'edge',
    sessionName: 'Edge',
    name: 'edge',
    version: '88.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    id: 'firefox',
    sessionName: 'Firefox (Playwright)',
    name: 'playwright-firefox',
    os: 'Windows',
    osVersion: '11',
  },
  {
    id: 'webkit-desktop',
    sessionName: 'WebKit desktop',
    name: 'playwright-webkit',
    os: 'OS X',
    // BrowserStack does not provide WebKit on Ventura or Sonoma for Playwright 1.59.
    osVersion: 'Sequoia',
  },
  {
    id: 'chrome-desktop',
    sessionName: 'Chrome desktop',
    name: 'chrome',
    version: '87.0',
    os: 'Windows',
    osVersion: '11',
  },
]
