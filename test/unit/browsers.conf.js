// Capabilities `curl -u "user:key" https://api.browserstack.com/automate/browsers.json`

module.exports = {
  EDGE: {
    base: 'BrowserStack',
    browser: 'Edge',
    browser_version: '18.0',
    os: 'Windows',
    os_version: '10',
  },
  FIREFOX: {
    base: 'BrowserStack',
    browser: 'Firefox',
    browser_version: '67.0',
    os: 'Windows',
    os_version: '10',
  },
  SAFARI: {
    base: 'BrowserStack',
    browser: 'Safari',
    browser_version: '12.0',
    os: 'OS X',
    os_version: 'Mojave',
  },
  CHROME_MOBILE: {
    base: 'BrowserStack',
    os: 'android',
    os_version: '10.0',
    browser: 'android',
    device: 'Google Pixel 4',
    browser_version: null,
    real_mobile: true,
  },
  SAFARI_MOBILE: {
    base: 'BrowserStack',
    os: 'ios',
    os_version: '12',
    device: 'iPhone XR',
    browser: 'iPhone',
    browser_version: null,
    real_mobile: true,
  },
  IE_11: {
    base: 'BrowserStack',
    browser: 'IE',
    browser_version: '11.0',
    os: 'Windows',
    os_version: '10',
  },
  IE_10: {
    base: 'BrowserStack',
    browser: 'IE',
    browser_version: '10.0',
    os: 'Windows',
    os_version: '7',
  },
}
