// Capabilities: https://www.browserstack.com/automate/capabilities

module.exports = [
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
    version: '14.0',
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
    osVersion: '12',
    device: 'iPhone XR',
  },
  {
    sessionName: 'IE',
    name: 'IE',
    version: '11.0',
    os: 'Windows',
    osVersion: '10',
  },
]
