// Capabilities: https://www.browserstack.com/automate/capabilities

const browserConfigurations = [
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
    sessionName: 'Safari desktop',
    name: 'Safari',
    version: '14.1',
    os: 'OS X',
    osVersion: 'Big Sur',
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
    osVersion: '14',
    device: 'iPhone 11',
  },
]

module.exports = {
  browserConfigurations,
}
