const baseConf = require('./wdio.base.conf')

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
}
