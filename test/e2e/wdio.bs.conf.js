const baseConf = require('./wdio.base.conf')
const browsers = require('./browsers.conf')
const getBuildInfos = require('../getBuildInfos')

exports.config = {
  ...baseConf,

  capabilities: Object.values(browsers).map((browser) => ({
    ...browser,
    'browserstack.video': false,
    'browserstack.local': true,
    project: 'browser sdk e2e',
    build: getBuildInfos(),
  })),
  logLevels: {
    '@wdio/browserstack-service': 'info',
  },
  baseUrl: `http://${process.env.IP_ADDRESS}:3000`,
  services: ['browserstack'],
  browserstackLocal: true,
  user: process.env.BS_USERNAME,
  key: process.env.BS_ACCESS_KEY,
}
