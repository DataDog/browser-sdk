const baseConf = require('./wdio.base.conf')

// https://sites.google.com/a/chromium.org/chromedriver/downloads
const CHROME_DRIVER_VERSION = '84.0.4147.30'

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
  services: [
    [
      'selenium-standalone',
      {
        installArgs: {
          drivers: {
            chrome: { version: CHROME_DRIVER_VERSION },
          },
        },
        args: {
          drivers: {
            chrome: { version: CHROME_DRIVER_VERSION },
          },
        },
      },
    ],
  ],
}
