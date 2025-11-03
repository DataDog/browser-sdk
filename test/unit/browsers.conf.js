// Capabilities: https://www.browserstack.com/automate/capabilities

/**
 * @type {Array<import('../browsers.conf').BrowserConfiguration>}
 */
const browserConfigurations = [
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
    version: '115.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    sessionName: 'Safari desktop',
    name: 'Safari',
    version: '14.1',
    os: 'OS X',
    osVersion: 'Big Sur',
  },
  {
    sessionName: 'Chrome desktop',
    name: 'Chrome',
    version: '80.0',
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
  {
    sessionName: 'Safari mobile',
    name: 'safari',
    os: 'ios',
    osVersion: '15',
    device: 'iPhone 13',
  },
]

module.exports = {
  browserConfigurations,
}
