const readFile = require('fs').readFileSync

const baseConf = require('./wdio.base.conf')

const ciConf = readFile('.gitlab-ci.yml', { encoding: 'utf-8' })
const CHROME_DRIVER_VERSION = /CHROME_DRIVER_VERSION: (.*)/.exec(ciConf)?.[1]

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
