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
    version: '132',
    os: 'Windows',
    osVersion: '11',
  },
  {
    sessionName: 'Safari desktop',
    name: 'playwright-webkit',
    version: '18.2',
    os: 'OS X',
    osVersion: 'Sequoia',
  },
  // {
  //   sessionName: 'Chrome mobile',
  //   name: 'chrome',
  //   os: 'android',
  //   osVersion: '12.0',
  //   device: 'Google Pixel 6 Pro',
  // },
]

module.exports = {
  browserConfigurations,
}
