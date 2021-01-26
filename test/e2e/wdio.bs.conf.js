const { getBuildInfos } = require('../utils')
const baseConf = require('./wdio.base.conf')
const browsers = require('./browsers.conf')

exports.config = {
  ...baseConf,

  specFileRetries: 1,

  capabilities: Object.values(browsers).map((browser) => ({
    ...browser,
    browserName: `${browser.browser} ${browser.browser_version || ''}`,
    'browserstack.video': false,
    'browserstack.local': true,
    project: 'browser sdk e2e',
    build: getBuildInfos(),
  })),
  logLevels: {
    '@wdio/browserstack-service': 'info',
  },
  services: [
    [
      'browserstack',
      {
        browserstackLocal: true,
      },
    ],
  ],
  user: process.env.BS_USERNAME,
  key: process.env.BS_ACCESS_KEY,
}
