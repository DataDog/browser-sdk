const baseConf = require('./wdio.base.conf')
const browsers = require('./browsers.conf')
const getTestName = require('../getTestName')

exports.config = {
  ...baseConf,

  capabilities: browsers.map((browser) => ({ ...browser, name: getTestName('E2E') })),
  baseUrl: 'http://local:3000',
  services: ['crossbrowsertesting'],
  user: process.env.CBT_USERNAME,
  key: process.env.CBT_AUTHKEY,
  hostname: 'hub.crossbrowsertesting.com',
  port: 80,
  cbtTunnel: true,
}
