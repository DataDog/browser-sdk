const browsers = require('../browsers.conf')

module.exports = [
  browsers['SAFARI'],
  {
    ...browsers['EDGE'],
    // Without this specific version, execute and executeAsync fails on Edge.
    'browserstack.selenium_version': '3.5.2',
    // Note: more recent versions of selenium 3 have the same issue, but selenium 4 seems to be
    // fine:
    // 'browserstack.selenium_version': '4.0.0-alpha-6',
  },
  browsers['FIREFOX'],
  {
    ...browsers['CHROME_MOBILE'],
    // cf https://github.com/webdriverio/webdriverio/issues/3264,
    'browserstack.appium_version': '1.9.1',
  },
  // Safari mobile on iOS 12.0 does not support
  // the way we flush events on page change
  // TODO check newer version on browserstack
  // browsers['SAFARI_MOBILE']
]
