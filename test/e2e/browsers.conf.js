// Capabilities: https://www.browserstack.com/automate/capabilities

/**
 * @type {Array<import('../browsers.conf').BrowserConfiguration>}
 */
const browserConfigurations = [
  {
    sessionName: 'Edge',
    name: 'edge',
    version: '100.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    sessionName: 'Firefox',
    name: 'playwright-firefox',
    version: '119',
    os: 'Windows',
    osVersion: '11',
  },
  {
    sessionName: 'Safari desktop',
    name: 'playwright-webkit',
    version: '17.4',
    os: 'OS X',
    osVersion: 'Big Sur',
  },
  {
    sessionName: 'Chrome mobile',
    name: 'chrome',
    osVersion: '12.0',
    device: 'Google Pixel 6 Pro',
  },
]

module.exports = {
  browserConfigurations,
}
