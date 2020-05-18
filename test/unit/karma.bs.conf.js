const karmaBaseConf = require('./karma.base.conf')
const browsers = require('../browsers.conf')
const { getBuildInfos, getIp } = require('../utils')

// force entry resolution to ensure sinon code is in ES5
// https://github.com/webpack/webpack/issues/5756
// https://github.com/sinonjs/sinon/blob/894951c/package.json#L113
karmaBaseConf.webpack.resolve.mainFields = ['cdn', 'main']

module.exports = function(config) {
  config.set({
    ...karmaBaseConf,
    plugins: [...karmaBaseConf.plugins, 'karma-browserstack-launcher'],
    reporters: [...karmaBaseConf.reporters, 'BrowserStack'],
    browsers: Object.keys(browsers),
    concurrency: 5,
    hostname: getIp(),
    browserStack: {
      username: process.env.BS_USERNAME,
      accessKey: process.env.BS_ACCESS_KEY,
      project: 'browser sdk unit',
      build: getBuildInfos(),
      video: false,
    },
    customLaunchers: Object.fromEntries(
      Object.entries(browsers).map(([key, browser]) => [key, { ...browser, name: key.toLowerCase() }])
    ),
  })
}
