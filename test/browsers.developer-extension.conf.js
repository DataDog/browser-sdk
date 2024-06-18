// Capabilities: https://www.browserstack.com/automate/capabilities

const extensionBrowserConfigurations = [
  {
    sessionName: 'Edge',
    name: 'Edge',
    version: '100.0',
    os: 'Windows',
    osVersion: '11',
  },
  {
    sessionName: 'Firefox',
    name: 'Firefox',
    version: '91.0',
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

module.exports = {
  extensionBrowserConfigurations,
}
