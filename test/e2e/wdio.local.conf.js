const baseConf = require('./wdio.base.conf')

// https://sites.google.com/a/chromium.org/chromedriver/downloads
const CHROME_DRIVER_VERSION = '81.0.4044.69'

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
