const karmaBaseConf = require('./karma.base.conf')
const browsers = require('./browsers.conf')
const getTestName = require('../getTestName')

// force entry resolution to ensure sinon code is in ES5
// https://github.com/webpack/webpack/issues/5756
// https://github.com/sinonjs/sinon/blob/894951c/package.json#L113
karmaBaseConf.webpack.resolve.mainFields = ['cdn', 'main']

const ONE_MINUTE = 60000

module.exports = function(config) {
  config.set({
    ...karmaBaseConf,
    plugins: [...karmaBaseConf.plugins, 'karma-cbt-launcher'],
    reporters: [...karmaBaseConf.reporters, 'CrossBrowserTesting'],
    browsers: Object.keys(browsers),
    concurrency: 1,
    captureTimeout: 3 * ONE_MINUTE,
    browserDisconnectTimeout: ONE_MINUTE,
    browserDisconnectTolerance: 3,
    browserNoActivityTimeout: ONE_MINUTE,
    cbtConfig: {
      username: process.env.CBT_USERNAME,
      authkey: process.env.CBT_AUTHKEY,
    },
    customLaunchers: Object.fromEntries(
      Object.entries(browsers).map(([key, browser]) => [key, { ...browser, name: getTestName('unit') }])
    ),
  })
}
