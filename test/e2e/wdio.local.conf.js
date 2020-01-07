const baseConf = require('./wdio.base.conf')

// https://sites.google.com/a/chromium.org/chromedriver/downloads
const CHROME_DRIVER_VERSION = '79.0.3945.36'

exports.config = {
  ...baseConf,

  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--headless', '--no-sandbox'],
      },
    },
  ],
  baseUrl: 'http://localhost:3000',
  services: ['selenium-standalone'],
  seleniumInstallArgs: {
    drivers: {
      chrome: { version: CHROME_DRIVER_VERSION },
    },
  },
  seleniumArgs: {
    drivers: {
      chrome: { version: CHROME_DRIVER_VERSION },
    },
  },
}
