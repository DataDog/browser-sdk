// Capabilities: https://www.browserstack.com/automate/capabilities

module.exports = [
  {
    sessionName: 'Edge',
    name: 'Edge',
    version: '86',
    os: 'Windows',
    osVersion: '10',
  },
  {
    sessionName: 'Firefox',
    name: 'Firefox',
    version: '78.0',
    os: 'Windows',
    osVersion: '10',
  },
  {
    sessionName: 'Safari desktop',
    name: 'Safari',
    version: '12.0',
    os: 'OS X',
    osVersion: 'Mojave',
  },
  {
    sessionName: 'Chrome mobile',
    name: 'chrome',
    os: 'android',
    osVersion: '10.0',
    device: 'Google Pixel 4',
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
