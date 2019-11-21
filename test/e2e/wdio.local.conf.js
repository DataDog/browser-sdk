const baseConf = require('./wdio.base.conf')

const CHROME_DRIVER_VERSION = '77.0.3865.40'

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
