const browsers = require('../browsers.conf')

module.exports = [
  browsers['SAFARI'],
  browsers['EDGE'],
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
