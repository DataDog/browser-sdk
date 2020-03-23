// Capabilities generator: https://app.crossbrowsertesting.com/selenium/run

module.exports = {
  EDGE: {
    base: 'CrossBrowserTesting',
    browserName: 'MicrosoftEdge',
    version: '18',
    platform: 'Windows 10',
  },
  FIREFOX: {
    base: 'CrossBrowserTesting',
    browserName: 'Firefox',
    version: '67',
    platform: 'Windows 10',
  },
  SAFARI: {
    base: 'CrossBrowserTesting',
    browserName: 'Safari',
    version: '12',
    platform: 'Mac OSX 10.14',
  },
  CHROME_MOBILE: {
    base: 'CrossBrowserTesting',
    browserName: 'Chrome',
    deviceName: 'Pixel 4',
    platformName: 'Android',
    platformVersion: '10.0',
  },
  SAFARI_MOBILE: {
    base: 'CrossBrowserTesting',
    browserName: 'Safari',
    deviceName: 'iPhone XR Simulator',
    platformName: 'iOS',
    platformVersion: '12.0',
  },
  IE_11: {
    base: 'CrossBrowserTesting',
    browserName: 'Internet Explorer',
    version: '11',
    platform: 'Windows 10',
  },
  IE_10: {
    base: 'CrossBrowserTesting',
    browserName: 'Internet Explorer',
    version: '10',
    platform: 'Windows 7 64-Bit',
  },
}
