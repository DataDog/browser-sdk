const execSync = require('child_process').execSync
const path = require('path')

const baseConf = require('./wdio.base.conf')
const browsers = require('./browsers.conf')
const getBuildInfos = require('../getBuildInfos')

const ipAddress = execSync(path.join(__dirname, '../..', 'scripts/get-ip.sh'))

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
  baseUrl: `http://${ipAddress}:3000`,
  services: ['browserstack'],
  browserstackLocal: true,
  user: process.env.BS_USERNAME,
  key: process.env.BS_ACCESS_KEY,
}
